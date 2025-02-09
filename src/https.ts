import * as fs from "node:fs";
import * as https from "node:https";
import * as path from "node:path";
import * as querystring from "node:querystring";
import * as timers from "node:timers";
import type * as url from "node:url";

interface Token {
    access_token: string;
    token_type: string;
    requested: number;
    expires_in: number;
    refresh_token: string;
    scope: string;
}

export class Handler {
    private static readonly MAX_RETRIES = 5;
    private lastCall?: number;
    private readonly tokenPath: string;
    private token?: Token;

    public constructor(appPath: string) {
        this.tokenPath = path.join(appPath, "token.json");
    }

    public async get(options: https.RequestOptions): Promise<string> {
        return this.doRequest(
            {
                hostname: "api.tumblr.com",
                method: "GET",
                port: 443,
                ...options
            },
            Handler.MAX_RETRIES
        ) as Promise<string>;
    }

    public async getFile(source: url.URL, outputFileName: string): Promise<void> {
        return this.doRequest(
            {
                hostname: source.hostname,
                method: "GET",
                path: source.pathname,
                port: 443
            },
            Handler.MAX_RETRIES,
            outputFileName
        ) as Promise<void>;
    }

    private async getToken(): Promise<Token> {
        try {
            if (!this.token) {
                this.token = JSON.parse(fs.readFileSync(this.tokenPath, { encoding: "utf-8" })) as Token;
            }

            if (this.token.requested + this.token.expires_in < Math.trunc(Date.now() / 1000) - 30) {
                console.warn("\tToken expired, refreshing...");
            } else {
                return this.token;
            }
        } catch (ignoreErr) {

        }

        /* eslint-disable camelcase */
        const tokenData = querystring.stringify({
            ...{
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                grant_type: this.token ? "refresh_token" : "authorization_code"
            },
            ...this.token
                ? { refresh_token: this.token.refresh_token }
                : {
                    code: process.env.CODE,
                    redirect_uri: process.env.REDIRECT_URI
                }
        });
        /* eslint-enable camelcase */

        const authData = await new Promise<string>((resolve, reject) => {
            let resData = "";

            const req = https.request({
                headers: {
                    "Content-Length": Buffer.byteLength(tokenData),
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": `TumblrSync/1.0.0`
                },
                hostname: "api.tumblr.com",
                method: "POST",
                path: "/v2/oauth2/token",
                port: 443
            }, (res) => {
                switch (res.statusCode) {
                    case 200:
                        res.setEncoding("utf8");

                        res.on("data", (chunk) => {
                            resData += chunk;
                        });

                        res.on("end", () => {
                            if (resData === "") {
                                reject(new Error("no data received"));
                                return;
                            }

                            resolve(resData);
                        });
                        break;

                    default:
                        reject(new Error(`response error, ${res.statusCode}`));
                        break;
                }
            });

            req.setTimeout(10000);

            req.on("error", (err) => {
                reject(new Error(`request error, ${err.toString()}`));
            });

            req.on("timeout", () => {
                req.destroy();
                reject(new Error(`timeout`));
            });

            req.write(tokenData);
            req.end();
        });

        this.token = {
            ...(JSON.parse(authData) as Omit<Token, "requested">),
            requested: Math.trunc(Date.now() / 1000)
        };
        fs.writeFileSync(this.tokenPath, JSON.stringify(this.token), { encoding: "utf-8" });
        return this.token;
    }

    private async doRequest(
        options: https.RequestOptions, failures: number, outputFileName?: string
    ): Promise<string | void> {
        if (failures === 0) {
            throw new Error("Request failed");
        }

        if (this.lastCall) {
            await new Promise((resolve) => {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const lC = this.lastCall!;
                const current = Date.now();
                timers.setTimeout(resolve, current - lC > 2000 ? 1 : current - lC);
            });
        }

        this.lastCall = Date.now();
        const token = await this.getToken();

        return new Promise<void | string>((resolve, reject) => {
            let resData = "";

            const retry = (msg: string): void => {
                console.error(`\t${msg}, retrying in 5 seconds ...`);
                timers.setTimeout(() => {
                    resolve(this.doRequest(options, failures - 1, outputFileName));
                }, 5000);
            };

            const req = https.request({
                headers: {
                    Authorization: `Bearer ${token.access_token}`,
                    "User-Agent": `TumblrSync/1.0.0`
                },
                ...options
            }, (res) => {
                switch (res.statusCode) {
                    case 200:
                        if (outputFileName) {
                            fs.mkdir(path.dirname(outputFileName), { recursive: true }, (err) => {
                                /* c8 ignore start */
                                if (err) {
                                    reject(err);
                                    return;
                                }
                                /* c8 ignore stop */

                                const fileSize = parseInt(res.headers["content-length"] ?? "0", 10);

                                try {
                                    const stat = fs.statSync(outputFileName);
                                    if (stat.size === fileSize) {
                                        console.warn(`\tFile ${outputFileName} already exists, skipping ...`);
                                        res.destroy();
                                        resolve();
                                        return;
                                    }
                                } catch (ignoreErr) {
                                }

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
                        timers.setTimeout(() => {
                            resolve(this.doRequest(options, failures - 1, outputFileName));
                        }, 10000);
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

            req.end();
        });
    }
}
