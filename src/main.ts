import * as fs from "node:fs/promises";
import * as https from "node:https";
import * as path from "node:path";
import * as timers from "node:timers";
import * as tumblr from "./tumblr.js";
import * as url from "node:url";

import { isEqual } from "lodash-es";
import { createWriteStream } from "node:fs";

let equalPosts = 0;

let fileRetries = 3;
async function getFile(source: url.URL, outputFileName: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const req = https.get(source, { headers: { "User-Agent": "TumblrSync/1.0.0" } }, async (response) => {
            const { statusCode } = response;

            if (statusCode === 302 && response.headers.location) {
                resolve(getFile(new url.URL(response.headers.location), outputFileName));
                return;
            } else if (statusCode !== 200) {
                if (--fileRetries > 0) {
                    await new Promise((resolve) => timers.setTimeout(resolve, 5000));
                    resolve(getFile(source, outputFileName));
                    return;
                }

                reject(new Error(`Request failed, ${response.statusCode}`));
                return;
            }

            fileRetries = 3;
            const file = createWriteStream(outputFileName);
            file.on("finish", () => {
                file.close();
                resolve();
            });

            response.pipe(file);
        });

        req.on("error", async (err) => {
            if (--fileRetries > 0) {
                await new Promise((resolve) => timers.setTimeout(resolve, 5000));
                resolve(getFile(source, outputFileName));
                return;
            }

            reject(err);
        });

        req.on("timeout", () => {
            req.destroy();

            if (--fileRetries > 0) {
                resolve(getFile(source, outputFileName));
            }

            reject(new Error("Request timeout"));
        });
    });
}

async function storePosts(posts: tumblr.Post[]): Promise<void> {
    for (const post of posts) {
        const when = new Date(post.timestamp * 1000);
        const tgtPath = path.join(
            process.env["BACKUP_DIR"] ?? "",
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

                if (equalPosts > 200) {
                    console.warn("Too many equal posts, stopping...");
                    process.exit(0);
                }

                continue;
            }
        } catch (ignoreErr) {

        }

        equalPosts = 0;

        console.info(`Storing post ${post.id_string}...`);
        await fs.writeFile(tgtPostFile, JSON.stringify(post, null, 2));

        const mediaPath = path.join(tgtPath, post.id_string);
        const mkdirMedia = () => {
            try {
                fs.mkdir(mediaPath, { recursive: true });
            } catch (ignoreErr) {

            }
        };

        const backupMedia = async(item: tumblr.BackuppableItem) => {
            if (item.type === "image") {
                mkdirMedia();

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
                await getFile(new url.URL(largest.url), path.join(mediaPath, imgFileName));
            }

            if ((item.type === "video" || item.type === "audio") && item.provider === "tumblr"){
                mkdirMedia();
                const mediaUrl = new url.URL(item.media.url);
                const mediaFileName = path.basename(mediaUrl.pathname);
                console.info(`\t and ${item.type} ${mediaFileName}...`);
                await getFile(mediaUrl, path.join(mediaPath, mediaFileName));
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

if (!process.env["BACKUP_DIR"]) {
    throw new Error("BACKUP_DIR not set");
}

if (!process.env["BLOG_NAME"]) {
    throw new Error("BLOG_NAME not set");
}

try {
    fs.mkdir(process.env["BACKUP_DIR"], { recursive: true });
} catch (ignoreErr) {

}

const client = new tumblr.Client(process.env["BACKUP_DIR"]);

await client.apiArrayCall<tumblr.Post>(
    `blog/${process.env["BLOG_NAME"]}/posts`,
    {
        totalKey: "total_posts",
        valuesKey: "posts",
        keyIndex: "id_string",
        keys: new Set<string>(),
        process: async (newPosts) => {
            return storePosts(newPosts);
        }
    },
    {
        npf: true,
        reblog_info: true,
        notes_info: true
    }
);
