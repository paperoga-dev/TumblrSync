import * as fs from "node:fs/promises";
import * as https from "node:https";
import * as path from "node:path";
import * as tumblr from "./tumblr.js";
import * as url from "node:url";

import { createWriteStream } from "node:fs";

class HttpError extends Error {
    public constructor(message: string, public readonly statusCode?: number) {
        super(message);
        this.name = "HttpError";
    }

    public override toString(): string {
        return `${this.name}: ${this.message}${this.statusCode ? ` (status code: ${this.statusCode})` : ""}`;
    }
}

class HttpFileError extends HttpError {
    public constructor(message: string, public override readonly statusCode?: number) {
        super(message, statusCode);
        this.name = "HttpFileError";
    }
}

async function getFile(source: url.URL, outputFileName: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        https.get(source, { headers: { "User-Agent": "TumblrSync/1.0.0" } }, (response) => {
            const { statusCode } = response;

            if (statusCode === 302 && response.headers.location) {
                resolve(getFile(new url.URL(response.headers.location), outputFileName));
                return;
            } else if (statusCode !== 200) {
                reject(new HttpFileError("Request failed", response.statusCode));
                return;
            }

            const file = createWriteStream(outputFileName);
            file.on("finish", () => {
                file.close();
                resolve();
            });

            response.pipe(file);
        }).on("error", (err) => {
            reject(new HttpFileError(err as unknown as string));
        });
    });
}

async function storePosts(posts: tumblr.Hashed<tumblr.Post>[]): Promise<void> {
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
            const oldPost = JSON.parse(await fs.readFile(tgtPostFile, { encoding: "utf-8" })) as tumblr.Hashed<tumblr.Post>;
            if (oldPost.hash === post.hash) {
                continue;
            }
        } catch (ignoreErr) {

        }

        process.stdout.write(`Storing post ${post.id_string}...\n`);
        await fs.writeFile(
            path.join(
                tgtPath,
                `${post.id_string}.json`
            ),
            JSON.stringify(post, null, 2)
        );

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
                process.stdout.write(`\t and image ${imgFileName}...\n`);

                await getFile(new url.URL(largest.url), path.join(mediaPath, imgFileName));
            }

            if ((item.type === "video" || item.type === "audio") && item.provider === "tumblr"){
                mkdirMedia();
                const mediaUrl = new url.URL(item.media.url);
                const mediaFileName = path.basename(mediaUrl.pathname);
                process.stdout.write(`\t and image ${mediaFileName}...\n`);
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

        process.stdout.write("\n");
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

let latestOffset = 0;

try {
    latestOffset = Math.max(parseInt(await fs.readFile(path.join(process.env["BACKUP_DIR"], "offset"), { encoding: "utf-8" })) - 20, 0);
} catch (ignoreErr) {

}

await client.apiArrayCall<tumblr.Post>(
    `blog/${process.env["BLOG_NAME"]}/posts`,
    {
        totalKey: "total_posts",
        valuesKey: "posts",
        keyIndex: "id_string",
        process: async (startOffset, newPosts) => {
            await storePosts(newPosts);
            await fs.writeFile(path.join(process.env["BACKUP_DIR"]!, "offset"), (startOffset + newPosts.length).toString());
        }
    },
    {
        limit: 100,
        offset: latestOffset,
        npf: true
    }
);
