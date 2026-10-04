import { factory, id, callable, names } from "./method-trace-ast.mjs";
import { updateTracedCallable } from "./method-trace-callable.mjs";
import { instrumentTraceControl } from "./method-trace-control.mjs";
import ts from "typescript";
import { readFile } from "node:fs/promises";
import { relative, resolve, dirname } from "node:path";

const excluded =
  /(?:diagnostics|execution-diagnostics|diagnostic-|\/zip\.ts$|page-api-main|extension-version|browser-api|types|dependencies|runtime-message-router)/;
export const isTraceSource = (file) => {
  const path = file.replaceAll("\\", "/");
  if (!path.includes("extension/src/") || excluded.test(path)) return false;
  return (
    /\/extension\/src\/(service-worker|content|providers|profile|policy|cdp|state|offscreen)\//.test(
      path,
    ) || /\/sidepanel\//.test(path)
  );
};
export const instrumentMethodSource = (source, file) => {
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const inventory = [];
  const transformed = ts.transform(parsed, [
    (context) => {
      const methodNames = new Map();
      const visit = (node, parent) => {
        if (callable(node)) {
          const line =
            parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line +
            1;
          const name =
            (ts.isConstructorDeclaration(node)
              ? "constructor"
              : node.name?.getText(parsed)) ??
            (ts.isVariableDeclaration(node.parent)
              ? node.parent.name.getText(parsed)
              : ts.isPropertyAssignment(node.parent)
                ? node.parent.name.getText(parsed)
                : ts.isCallExpression(node.parent)
                  ? (ts.isPropertyAccessExpression(node.parent.expression)
                      ? node.parent.expression.name.getText(parsed)
                      : ts.isIdentifier(node.parent.expression)
                        ? node.parent.expression.text
                        : "call") + ".callback"
                  : "callback");
          const method = `${relative(resolve("extension/src"), file).replaceAll("\\", "/")}:${line}:${name}#${parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).character + 1}`;
          if (node.asteriskToken)
            throw new Error(
              `Generator trace requires an explicit adapter: ${method}`,
            );
          const local = id(`__methodContext_${line}_${inventory.length}`);
          methodNames.set(local.text, method);
          inventory.push({ method, kind: ts.SyntaxKind[node.kind], line });
          const parameters = node.parameters.map((parameter) =>
            ts.visitNode(parameter, (child) => visit(child, parent)),
          );
          const body = ts.visitEachChild(
            ts.isBlock(node.body)
              ? node.body
              : factory.createBlock(
                  [factory.createReturnStatement(node.body)],
                  true,
                ),
            (child) => visit(child, local),
            context,
          );
          const inputs = factory.createObjectLiteralExpression(
            node.parameters.flatMap((parameter) =>
              names(parameter.name).map((name) =>
                factory.createShorthandPropertyAssignment(name),
              ),
            ),
            true,
          );
          return updateTracedCallable({
            node,
            parameters,
            local,
            inputs,
            parent,
            method,
            body,
          });
        }
        let updated = ts.visitEachChild(
          node,
          (child) => visit(child, parent),
          context,
        );
        return instrumentTraceControl({
          node,
          updated,
          parent,
          methodNames,
          parsed,
        });
      };
      return (root) => visit(root, undefined);
    },
  ]);
  const path = relative(
    dirname(file),
    resolve("extension/src/diagnostics/method-trace.ts"),
  )
    .replaceAll("\\", "/")
    .replace(/\.ts$/, ".js");
  const header = `import { traceBranch as __traceBranch, traceMethod as __traceMethod, withMethodContext as __withMethodContext, traceConstructorStart as __traceConstructorStart, traceConstructorError as __traceConstructorError, traceConstructorEnd as __traceConstructorEnd } from ${JSON.stringify(path.startsWith(".") ? path : "./" + path)};\n`;
  const text =
    header + ts.createPrinter().printFile(transformed.transformed[0]);
  transformed.dispose();
  return { text, inventory };
};
export const methodTracePlugin = (inventory) => ({
  name: "method-trace",
  setup(build) {
    build.onLoad({ filter: /\.ts$/ }, async ({ path }) => {
      if (!isTraceSource(path)) return;
      const result = instrumentMethodSource(await readFile(path, "utf8"), path);
      inventory.push(...result.inventory);
      return { contents: result.text, loader: "ts", resolveDir: dirname(path) };
    });
  },
});
