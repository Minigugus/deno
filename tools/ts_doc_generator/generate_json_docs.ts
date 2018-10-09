import {
  NamespaceDeclaration,
  NamespaceDeclarationKind,
  Project,
  TypeGuards
} from "ts-simple-ast";

interface GenerateJsonDocsOptions {
  basePath: string;
  buildPath: string;
  debug: boolean;
  inputFile: string;
  outputFile: string;
  silent: string;
}

interface DocumentationNode {
  type: string;
  children: DocumentationNode[];
}

interface NamespaceNode extends DocumentationNode {
  type: "namespace";
  name: string;
  kind: "global" | "module" | "namespace";
}

export function main({
  basePath,
  buildPath,
  inputFile,
  outputFile,
  silent
}: GenerateJsonDocsOptions): void {
  const globalScopeChildren: DocumentationNode[] = [];

  function parseNamespace(namespace: NamespaceDeclaration): NamespaceNode {
    const type = "namespace";
    const name = namespace.getName();
    const declarationKind = namespace.getDeclarationKind();
    const kind =
      declarationKind === NamespaceDeclarationKind.Global
        ? "global"
        : declarationKind === NamespaceDeclarationKind.Module
          ? "module"
          : "namespace";

    const children = namespace.getChildren().map(node => {
      if ()
    });

    return {
      type,
      name,
      kind,
      children
    };
  }

  const inputProject = new Project({
    compilerOptions: {
      noLib: true,
      strict: true
    }
  });

  const output: NamespaceNode = {
    type: "namespace",
    name: "global",
    kind: "global",
    children: globalScopeChildren
  };

  const libRuntimeDts = inputProject.addExistingSourceFile(inputFile);
  libRuntimeDts.forEachChild(node => {
    if (TypeGuards.isNamespaceDeclaration(node)) {
      globalScopeChildren.push(parseNamespace(node));
    }
  });
  console.log(JSON.stringify(output, undefined, "  "));
}
