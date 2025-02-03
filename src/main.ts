/* eslint-disable no-await-in-loop */
import * as fs from "node:fs/promises";
import * as https from "./https.js";
import * as path from "node:path";
import * as tumblr from "./tumblr.js";
import * as url from "node:url";

import { isEqual } from "lodash-es";

let equalPosts = 0;

class TooManyEqualPostsError extends Error {
    public constructor() {
        super("Too many equal posts, stopping...");
        this.name = "TooManyEqualPostsError";
    }
}


function removeKeysDeep<T extends Record<string, unknown> | Record<string, unknown>[]>(
    obj: T, keysToRemove: string[]
): T {
    if (Array.isArray(obj)) {
        return obj.map((item: unknown) => typeof item === "object"
            ? removeKeysDeep(item as Record<string, unknown>, keysToRemove)
            : item as unknown) as T;
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

async function storePosts(posts: tumblr.Post[], forced: boolean): Promise<void> {
    for (let post of posts) {
        post = removeKeysDeep(post, ["embed_iframe", "updated"]);

        const when = new Date(post.timestamp * 1000);
        const tgtPath = path.join(
            process.env.BACKUP_DIR ?? "",
            when.getFullYear().toString(),
            (when.getMonth() + 1).toString().padStart(2, "0"),
            when.getDate().toString().padStart(2, "0")
        );

        try {
            await fs.mkdir(tgtPath, { recursive: true });
        } catch (ignoreErr) {

        }

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
                await https.getFile(new url.URL(largest.url), path.join(mediaPath, imgFileName));
            }

            if ((item.type === "video" || item.type === "audio") && item.provider === "tumblr") {
                const mediaUrl = new url.URL(item.media.url);
                const mediaFileName = path.basename(mediaUrl.pathname);
                console.info(`\t and ${item.type} ${mediaFileName}...`);
                await https.getFile(mediaUrl, path.join(mediaPath, mediaFileName));
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

if (!process.env.BACKUP_DIR) {
    throw new Error("BACKUP_DIR not set");
}

if (!process.env.BLOG_NAME) {
    throw new Error("BLOG_NAME not set");
}

try {
    await fs.mkdir(process.env.BACKUP_DIR, { recursive: true });
} catch (ignoreErr) {

}

const client = new tumblr.Client(process.env.BACKUP_DIR);

try {
    await client.apiArrayCall<tumblr.Post>(
        `blog/${process.env.BLOG_NAME}/posts`,
        {
            keyIndex: "id_string",
            keys: new Set<string>(),
            process: async (newPosts): Promise<void> => storePosts(newPosts, process.argv.includes("--force")),
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
        throw err;
    }
}
