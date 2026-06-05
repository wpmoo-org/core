const mutatingRouteMethods = new Set(["DELETE", "PATCH", "POST", "PUT"]);

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require mutating server actions and route handlers to go through the correct security wrapper."
    },
    messages: {
      rawServerAction:
        "Mutating server actions must be exported through action() or actionState().",
      rawRouteHandler:
        "Mutating route handlers must be exported through routeAction()."
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
        const isBetterAuthRouteHandler = /(?:^|\/)app\/api\/auth\/\[\.\.\.all\]\/route\.[cm]?[jt]sx?$/.test(filename);

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
              messageId: isRouteHandler ? "rawRouteHandler" : "rawServerAction"
            });
            continue;
          }

          if (declaration.type === "VariableDeclaration") {
            for (const declarator of declaration.declarations) {
              if (isRouteHandler) {
                const routeMethod = getDeclaratorName(declarator);

                if (isBetterAuthRouteHandler && isAuthHandlerExport(declarator)) {
                  continue;
                }

                if (!isMutatingRouteMethod(routeMethod)) {
                  continue;
                }

                if (!isCallTo(declarator.init, "routeAction")) {
                  context.report({
                    node: declarator,
                    messageId: "rawRouteHandler"
                  });
                }

                continue;
              }

              if (
                !isCallTo(declarator.init, "action") &&
                !isCallTo(declarator.init, "actionState")
              ) {
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

function getDeclaratorName(declarator) {
  return declarator.id.type === "Identifier" ? declarator.id.name : undefined;
}

function isCallTo(node, name) {
  if (node?.type !== "CallExpression") {
    return false;
  }

  return node.callee.type === "Identifier" && node.callee.name === name;
}

function isAuthHandlerExport(declarator) {
  const routeMethod = getDeclaratorName(declarator);

  if (!isMutatingRouteMethod(routeMethod)) {
    return false;
  }

  if (declarator.init?.type !== "Identifier") {
    return false;
  }

  return declarator.init.name === "handleAuth";
}
