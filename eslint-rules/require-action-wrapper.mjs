const mutatingRouteMethods = new Set(["DELETE", "PATCH", "POST", "PUT"]);

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require mutating server actions and route handlers to go through action()."
    },
    messages: {
      rawServerAction:
        "Mutating server actions and route handlers must be exported through action()."
    },
    schema: []
  },
  create(context) {
    return {
      Program(program) {
        const filename = context.filename ?? "";
        const isServerActionFile =
          hasUseServerDirective(program) ||
          /(?:^|\/)app\/.*\/actions?\.[cm]?[jt]sx?$/.test(filename);
        const isRouteHandler = /(?:^|\/)route\.[cm]?[jt]sx?$/.test(filename);

        if (!isServerActionFile && !isRouteHandler) {
          return;
        }

        for (const node of program.body) {
          if (node.type !== "ExportNamedDeclaration" || node.declaration === null) {
            continue;
          }

          const declaration = node.declaration;

          if (declaration.type === "FunctionDeclaration") {
            if (isRouteHandler && !isMutatingRouteMethod(declaration.id?.name)) {
              continue;
            }

            context.report({
              node: declaration,
              messageId: "rawServerAction"
            });
            continue;
          }

          if (declaration.type === "VariableDeclaration") {
            for (const declarator of declaration.declarations) {
              if (!isActionCall(declarator.init)) {
                context.report({
                  node: declarator,
                  messageId: "rawServerAction"
                });
              }
            }
          }
        }
      }
    };
  }
};

function hasUseServerDirective(program) {
  return program.body.some(
    (node) => node.type === "ExpressionStatement" && node.directive === "use server"
  );
}

function isMutatingRouteMethod(name) {
  return typeof name === "string" && mutatingRouteMethods.has(name);
}

function isActionCall(node) {
  if (node?.type !== "CallExpression") {
    return false;
  }

  return node.callee.type === "Identifier" && node.callee.name === "action";
}
