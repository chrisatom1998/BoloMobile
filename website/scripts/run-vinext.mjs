process.env.WRANGLER_LOG_PATH = ".wrangler/wrangler.log";

await import(new URL("./cli.js", import.meta.resolve("vinext")));
