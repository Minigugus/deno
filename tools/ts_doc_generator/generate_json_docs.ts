import {
  FunctionDeclaration,
  InterfaceDeclaration,
  ModuleResolutionKind,
  NamespaceDeclaration,
  NamespaceDeclarationKind,
  Node,
  Project,
  ScriptTarget,
  SyntaxKind,
  SyntaxList,
  Type,
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
  name: string;
}

interface ChildableNode extends DocumentationNode {
  children: DocumentationNode[];
}

interface NamespaceNode extends ChildableNode {
  type: "namespace";
  kind: "global" | "module" | "namespace";
}

interface FunctionNode extends DocumentationNode {
  type: "function";
  returnType: TypeNode;
  docs?: string;
}

interface TypeNode {
  text: string;
  symbol?: string;
  aliasSymbol?: string;
}

interface InterfaceNode extends ChildableNode {
  type: "interface";
}

export function main({
  basePath,
  buildPath,
  inputFile,
  outputFile,
  silent
}: GenerateJsonDocsOptions): void {
  const globalScopeChildren: DocumentationNode[] = [];

  function parseSyntaxList(syntaxList: SyntaxList): DocumentationNode[] {
    return mapChildren(syntaxList.getChildren());
  }

  function parseType(type: Type, enclosingNode?: Node): TypeNode {
    const text = type.getText(enclosingNode);
    const symbol = type.getSymbol();
    const aliasSymbol = type.getAliasSymbol();
    return {
      text,
      symbol: symbol && symbol.getFullyQualifiedName(),
      aliasSymbol: aliasSymbol && aliasSymbol.getFullyQualifiedName()
    };
  }

  function parseFunctionDeclaration(
    functionDeclaration: FunctionDeclaration
  ): FunctionNode {
    const type = "function";
    const name = functionDeclaration.getName() || "(anonymous)";
    // const params = functionDeclaration.getParameters();
    const returnType = parseType(
      functionDeclaration.getReturnType(),
      functionDeclaration
    );
    const docs =
      functionDeclaration
        .getJsDocs()
        .map(jsdoc => jsdoc.getInnerText())
        .join("\n") || undefined;
    return {
      type,
      name,
      returnType,
      docs
    };
  }

  function parseInterfaceDeclaration(
    interfaceDeclaration: InterfaceDeclaration
  ): InterfaceNode {
    const type = "interface";
    const name = interfaceDeclaration.getName();
    interfaceDeclaration.getChildren().forEach(node => {
      console.log(name, node.getKindName());
    });
    return {
      type,
      name,
      children: []
    };
  }

  function mapChildren(children: Node[]): DocumentationNode[] {
    const output: DocumentationNode[] = [];
    for (const node of children) {
      if (TypeGuards.isNamespaceDeclaration(node)) {
        output.push(parseNamespace(node));
      } else if (TypeGuards.isSyntaxList(node)) {
        output.push(...parseSyntaxList(node));
      } else if (TypeGuards.isFunctionDeclaration(node)) {
        output.push(parseFunctionDeclaration(node));
      } else if (TypeGuards.isInterfaceDeclaration(node)) {
        output.push(parseInterfaceDeclaration(node));
      } else {
        console.log(node.getKindName());
      }
    }
    return output;
  }

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

    const [moduleBock] = namespace.getChildrenOfKind(SyntaxKind.ModuleBlock);
    if (!moduleBock) {
      throw new Error(`Namespace "${name}" missing module block.`);
    }
    const children = mapChildren(moduleBock.getChildren());

    return {
      type,
      name,
      kind,
      children
    };
  }

  const inputProject = new Project({
    compilerOptions: {
      baseUrl: buildPath,
      moduleResolution: ModuleResolutionKind.NodeJs,
      noLib: true,
      strict: true,
      target: ScriptTarget.ESNext,
      types: ["text-encoding"]
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
