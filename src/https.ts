import * as fs from "node:fs";
import * as https from "node:https";
import * as path from "node:path";
import * as timers from "node:timers";
import type * as url from "node:url";

export class TokenError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = "TokenError";
    }

    public override toString(): string {
        return `${this.name}: ${this.message}`;
    }
}

async function doRequest(
    options: https.RequestOptions, failures: number, outputFileName?: string, reqData?: string
): Promise<string | void> {
    if (failures === 0) {
        throw new Error("Request failed");
    }

    return new Promise<void | string>((resolve, reject) => {
        let resData = "";

        const retry = (msg: string): void => {
            console.error(`\t${msg}, retrying in 10 seconds ...`);
            timers.setTimeout(() => {
                resolve(doRequest(options, failures - 1, outputFileName, reqData));
            }, 10000);
        };

        const req = https.request({
            headers: {
                "User-Agent": `TumblrSync/1.0.0`
            },
            ...options
        }, (res) => {
            switch (res.statusCode) {
                case 200:
                    if (outputFileName) {
                        fs.mkdir(path.dirname(outputFileName), { recursive: true }, (err) => {
                            if (err) {
                                reject(err);
                                return;
                            }

                            const fileSize = parseInt(res.headers["content-length"] ?? "0", 10);

                            const file = fs.createWriteStream(outputFileName);
                            file.on("finish", () => {
                                file.close();

                                fs.stat(outputFileName, (stErr, stats) => {
                                    if (stErr || stats.size !== fileSize) {
                                        retry("file size mismatch");
                                        return;
                                    }

                                    resolve();
                                });
                            });

                            res.pipe(file);
                        });
                        return;
                    }

                    res.setEncoding("utf8");

                    res.on("data", (chunk) => {
                        resData += chunk;
                    });

                    res.on("end", () => {
                        if (resData === "") {
                            retry("no data received");
                            return;
                        }

                        resolve(resData);
                    });
                    break;

                case 401:
                    reject(new TokenError("Unauthorized"));
                    break;

                default:
                    retry(`response error, ${res.statusCode}`);
                    break;
            }
        });

        req.setTimeout(10000);

        req.on("error", (err) => {
            retry(`request error, ${err.toString()}`);
        });

        req.on("timeout", () => {
            req.destroy();
            retry("timeout");
        });

        if (reqData) {
            req.write(reqData);
        }

        req.end();
    });
}

export async function get(options: https.RequestOptions): Promise<string> {
    return doRequest(
        {
            hostname: "api.tumblr.com",
            method: "GET",
            port: 443,
            ...options
        },
        5
    ) as Promise<string>;
}

export async function getFile(source: url.URL, outputFileName: string): Promise<void> {
    return doRequest(
        {
            hostname: source.hostname,
            method: "GET",
            path: source.pathname,
            port: 443
        },
        5,
        outputFileName
    ) as Promise<void>;
}

export async function post(options: https.RequestOptions, reqData: string): Promise<string> {
    return doRequest(
        {
            headers: {
                "Content-Length": Buffer.byteLength(reqData),
                "Content-Type": "application/x-www-form-urlencoded"
            },
            hostname: "api.tumblr.com",
            method: "POST",
            port: 443,
            ...options
        },
        5,
        undefined,
        reqData
    ) as Promise<string>;
}
