import ts from "typescript";
import { factory, call, containsSuspension } from "./method-trace-ast.mjs";
export const instrumentTraceControl = ({
  node,
  updated,
  parent,
  methodNames,
  parsed,
}) => {
  if (
    parent &&
    (ts.isIfStatement(updated) ||
      ts.isConditionalExpression(updated) ||
      ts.isSwitchStatement(updated))
  ) {
    const position =
      parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1;
    const condition = call("__traceBranch", [
      parent,
      factory.createStringLiteral(methodNames.get(parent.text)),
      factory.createStringLiteral(`${ts.SyntaxKind[node.kind]}:${position}`),
      updated.expression ?? updated.condition,
      factory.createStringLiteral(
        (node.expression ?? node.condition).getText(parsed).slice(0, 1000),
      ),
    ]);
    if (ts.isIfStatement(updated))
      updated = factory.updateIfStatement(
        updated,
        condition,
        updated.thenStatement,
        updated.elseStatement,
      );
    else if (ts.isSwitchStatement(updated))
      updated = factory.updateSwitchStatement(
        updated,
        condition,
        updated.caseBlock,
      );
    else
      updated = factory.updateConditionalExpression(
        updated,
        condition,
        updated.questionToken,
        updated.whenTrue,
        updated.colonToken,
        updated.whenFalse,
      );
  }
  if (parent && ts.isCatchClause(updated)) {
    const failure = updated.variableDeclaration?.name;
    updated = factory.updateCatchClause(
      updated,
      updated.variableDeclaration,
      factory.updateBlock(updated.block, [
        factory.createExpressionStatement(
          call("__traceBranch", [
            parent,
            factory.createStringLiteral(methodNames.get(parent.text)),
            factory.createStringLiteral("caught_error"),
            failure && ts.isIdentifier(failure)
              ? failure
              : factory.createStringLiteral("caught_without_binding"),
          ]),
        ),
        ...updated.block.statements,
      ]),
    );
  }
  if (
    parent &&
    ts.isCallExpression(updated) &&
    !(node.flags & ts.NodeFlags.OptionalChain) &&
    !containsSuspension(updated)
  ) {
    return call("__withMethodContext", [
      parent,
      factory.createArrowFunction(
        undefined,
        undefined,
        [],
        undefined,
        factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
        updated,
      ),
    ]);
  }
  return updated;
};
