import * as esbuild from "esbuild";
import * as path from "node:path";

import devDependencies from "./package.json" with { type: "json" };

const production = process.argv.includes("--production");

async function main() {
    console.info(`Building...`);

    const result = await esbuild.build({
        bundle: true,
        entryPoints: ["src/main.ts"],
        external: [...Object.keys(devDependencies)],
        format: "esm",
        logLevel: "info",
        metafile: true,
        minify: production,
        outfile: path.join("dist", "main.js"),
        platform: "node",
        sourcemap: !production,
        sourcesContent: !production,
        tsconfig: "tsconfig.json",
        write: true
    });

    for (const messages of [
        {
            caption: `✘ [ERROR]`,
            set: result.errors
        },
        {
            caption: `? [WARNING]`,
            set: result.warnings
        }
    ]) {
        messages.set.forEach((msg) => {
            console.error(`${messages.caption} [ERROR] ${msg.text}`);
            console.error(`  ${msg.location?.file}:${msg.location?.line}:${msg.location?.column}:`);
            for (const note of msg.notes) {
                console.error(`    ${note.text}`);
                console.error(`    ${note.location?.file}:${note.location?.line}:${note.location?.column}:`);
            }
        });
    }

    const analysis = await esbuild.analyzeMetafile(result.metafile, { verbose: true });
    console.info(analysis);
}

process.exitCode = 0;
main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
