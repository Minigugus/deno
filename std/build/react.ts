const [diagnostics, output] = await Deno.compile(
  "./std/build/examples/react-index.jsx",
  undefined,
  {
    allowJs: true,
    checkJs: true,
    lib: ["dom", "es2018"],
    sourceMap: false,
    target: "es2018",
    types: ["./std/build/types/react.d.ts", "./std/build/types/react-dom.d.ts"]
  }
);

if (diagnostics) {
  console.log(Deno.formatDiagnostics(diagnostics));
}
for (const [filename, text] of Object.entries(output)) {
  console.log(`--> Output file: "${filename}\n\n`);
  console.log(text);
}
