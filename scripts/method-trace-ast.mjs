import ts from "typescript";
export const factory = ts.factory;
export const id = (name) => factory.createIdentifier(name);
export const call = (name, args) =>
  factory.createCallExpression(id(name), undefined, args);
export const callable = (node) =>
  (ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node) ||
    ts.isConstructorDeclaration(node)) &&
  !!node.body;
export const containsSuspension = (node) => {
  if (
    ts.isAwaitExpression(node) ||
    ts.isYieldExpression(node) ||
    node.kind === ts.SyntaxKind.SuperKeyword
  )
    return true;
  if (callable(node)) return false;
  return !!ts.forEachChild(node, containsSuspension);
};
export const names = (name) =>
  ts.isIdentifier(name)
    ? [name]
    : name.elements.flatMap((part) =>
        ts.isOmittedExpression(part) ? [] : names(part.name),
      );
