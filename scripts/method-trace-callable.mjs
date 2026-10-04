import ts from "typescript";
import { factory, id, call } from "./method-trace-ast.mjs";
export const updateTracedCallable = ({
  node,
  parameters,
  local,
  inputs,
  parent,
  method,
  body,
}) => {
  // Constructors have special return/super semantics. Keep the body in place,
  // but use a try/finally span rather than moving it into a callback.
  if (ts.isConstructorDeclaration(node)) {
    const begin = factory.createVariableStatement(
      undefined,
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            local,
            undefined,
            undefined,
            call("__traceConstructorStart", [
              factory.createStringLiteral(method),
              inputs,
              parent ?? id("undefined"),
            ]),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );
    const error = id("__traceConstructorFailure");
    const guarded = factory.createTryStatement(
      body,
      factory.createCatchClause(
        factory.createVariableDeclaration(error),
        factory.createBlock(
          [
            factory.createExpressionStatement(
              call("__traceConstructorError", [local, error]),
            ),
            factory.createThrowStatement(error),
          ],
          true,
        ),
      ),
      factory.createBlock(
        [
          factory.createExpressionStatement(
            call("__traceConstructorEnd", [local]),
          ),
        ],
        true,
      ),
    );
    return factory.updateConstructorDeclaration(
      node,
      node.modifiers,
      parameters,
      factory.createBlock([begin, guarded], true),
    );
  }
  const async = node.modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
  );
  const callback = factory.createArrowFunction(
    async ? [factory.createModifier(ts.SyntaxKind.AsyncKeyword)] : undefined,
    undefined,
    [factory.createParameterDeclaration(undefined, undefined, local)],
    undefined,
    factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
    body,
  );
  const traced = call("__traceMethod", [
    factory.createStringLiteral(method),
    inputs,
    callback,
    parent ?? id("undefined"),
  ]);
  const newBody = factory.createBlock(
    [factory.createReturnStatement(traced)],
    true,
  );
  if (ts.isArrowFunction(node))
    return factory.updateArrowFunction(
      node,
      node.modifiers,
      node.typeParameters,
      parameters,
      node.type,
      node.equalsGreaterThanToken,
      newBody,
    );
  if (ts.isFunctionDeclaration(node))
    return factory.updateFunctionDeclaration(
      node,
      node.modifiers,
      node.asteriskToken,
      node.name,
      node.typeParameters,
      parameters,
      node.type,
      newBody,
    );
  if (ts.isFunctionExpression(node))
    return factory.updateFunctionExpression(
      node,
      node.modifiers,
      node.asteriskToken,
      node.name,
      node.typeParameters,
      parameters,
      node.type,
      newBody,
    );
  if (ts.isMethodDeclaration(node))
    return factory.updateMethodDeclaration(
      node,
      node.modifiers,
      node.asteriskToken,
      node.name,
      node.questionToken,
      node.typeParameters,
      parameters,
      node.type,
      newBody,
    );
  if (ts.isGetAccessor(node))
    return factory.updateGetAccessorDeclaration(
      node,
      node.modifiers,
      node.name,
      parameters,
      node.type,
      newBody,
    );
  return factory.updateSetAccessorDeclaration(
    node,
    node.modifiers,
    node.name,
    parameters,
    newBody,
  );
};
