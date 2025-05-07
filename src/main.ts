/* eslint-disable no-await-in-loop */
import * as fs from "node:fs/promises";
import * as https from "./https.js";
import * as path from "node:path";
import * as tumblr from "./tumblr.js";
import * as url from "node:url";

import { hideBin } from "yargs/helpers";
import { isEqual } from "lodash-es";
import yargs from "yargs";

const argv = await yargs(hideBin(process.argv))
    .option("folder", {
        demandOption: true,
        describe: "The folder path",
        type: "string"
    })
    .option("force", {
        default: false,
        describe: "Force the operation",
        type: "boolean"
    })
    .version(false)
    .fail((msg, err) => {
        if (msg) {
            throw new Error(msg);
        } else {
            throw err;
        }
    })
    .help()
    .parse();

let equalPosts = 0;

class TooManyEqualPostsError extends Error {
    public constructor() {
        super("Too many equal posts, stopping...");
        this.name = "TooManyEqualPostsError";
    }
}

async function makeDir(tgtPath: string): Promise<void> {
    try {
        await fs.mkdir(tgtPath, { recursive: true });
    /* c8 ignore start */
    } catch (ignoreErr) {

    }
    /* c8 ignore stop */
}

function removeKeysDeep<T extends Record<string, unknown> | Record<string, unknown>[]>(
    obj: T, keysToRemove: string[]
): T {
    if (Array.isArray(obj)) {
        return obj.map((item: unknown) => typeof item === "object"
            ? removeKeysDeep(item as T, keysToRemove)
            : item) as T;
    } else if (typeof obj === "object") {
        // eslint-disable-next-line @typescript-eslint/no-for-in-array
        for (const key in obj) {
            if (keysToRemove.includes(key)) {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete obj[key];
            } else if (typeof obj[key] === "object") {
                obj[key] = removeKeysDeep(obj[key] as Record<string, unknown>, keysToRemove) as T[typeof key];
            }
        }
    }

    return obj;
}

async function storePosts(blogName: string, handler: https.Handler, posts: tumblr.Post[], forced: boolean): Promise<void> {
    for (let post of posts) {
        post = removeKeysDeep(post, ["embed_iframe", "updated"]);

        const when = new Date(post.timestamp * 1000);
        const tgtPath = path.join(
            argv.folder,
            blogName,
            when.getFullYear().toString(),
            (when.getMonth() + 1).toString().padStart(2, "0"),
            when.getDate().toString().padStart(2, "0")
        );

        await makeDir(tgtPath);

        const tgtPostFile = path.join(tgtPath, `${post.id_string}.json`);
        try {
            const existingPost = JSON.parse(await fs.readFile(tgtPostFile, { encoding: "utf-8" })) as tumblr.Post;
            if (isEqual(existingPost, post)) {
                console.warn(`Post ${post.id_string} already stored, skipping...`);
                ++equalPosts;

                if (!forced && equalPosts > 100) {
                    throw new TooManyEqualPostsError();
                }

                continue;
            } else {
                console.warn(`Post ${post.id_string} has changed, updating...`);
                try {
                    await fs.rm(`${tgtPostFile}.bak`);
                } catch (ignoreErr) {
                }

                await fs.rename(tgtPostFile, `${tgtPostFile}.bak`);
            }
        } catch (err) {
            if (err instanceof TooManyEqualPostsError) {
                throw err;
            }
        }

        equalPosts = 0;

        console.info(`Storing post ${post.id_string}...`);
        await fs.writeFile(tgtPostFile, JSON.stringify(post, null, 2));

        const mediaPath = path.join(tgtPath, post.id_string);
        const backupMedia = async (item: tumblr.BackuppableItem): Promise<void> => {
            if (item.type === "image") {
                let largest: tumblr.MediaItem | undefined = undefined;
                let largestArea = 0;
                for (const img of item.media) {
                    if ((img.width ?? 0) * (img.height ?? 0) > largestArea) {
                        largest = img;
                        largestArea = (img.width ?? 0) * (img.height ?? 0);
                    }
                }

                if (!largest) {
                    return;
                }

                const imgUrl = new url.URL(largest.url);
                const imgFileName = path.basename(imgUrl.pathname);
                console.info(`\t and ${item.type} ${imgFileName}...`);
                await handler.getFile(new url.URL(largest.url), path.join(mediaPath, imgFileName));
            }

            if ((item.type === "video" || item.type === "audio") && item.provider === "tumblr") {
                const mediaUrl = new url.URL(item.media.url);
                const mediaFileName = path.basename(mediaUrl.pathname);
                console.info(`\t and ${item.type} ${mediaFileName}...`);
                await handler.getFile(mediaUrl, path.join(mediaPath, mediaFileName));
            }
        };

        for (const item of post.content) {
            await backupMedia(item);
        }

        for (const item of post.trail) {
            for (const trailItem of item.content) {
                await backupMedia(trailItem);
            }
        }

        console.info();
    }
}

await makeDir(argv.folder);

const handler = new https.Handler(argv.folder);
const client = new tumblr.Client(handler);

const userData = await client.apiCall<tumblr.User>("user/info");
let wasAnError = false;

for (const blog of userData.blogs) {
    try {
        await makeDir(path.join(argv.folder, blog.name));

        await client.apiArrayCall<tumblr.Post>(
            `blog/${blog.name}/posts`,
            {
                keyIndex: "id_string",
                keys: new Set<string>(),
                process: async (newPosts): Promise<void> =>
                    storePosts(blog.name, handler, newPosts, process.argv.includes("--force")),
                totalKey: "total_posts",
                valuesKey: "posts"
            },
            {
                /* eslint-disable camelcase */
                notes_info: true,
                npf: true,
                reblog_info: true
                /* eslint-enable camelcase */
            }
        );
    } catch (err) {
        if (err instanceof TooManyEqualPostsError) {
            console.warn(err.message);
        } else {
            wasAnError = true;
            console.error((err as Error).message);
        }
    }
}

if (wasAnError) {
    throw new Error("There were errors during the backup process");
}
