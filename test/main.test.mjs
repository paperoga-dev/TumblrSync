import * as _ from "lodash-es";
import * as path from "node:path";
import * as querystring from "node:querystring";
import * as td from "testdouble";
import * as timers from "node:timers";

console.info = () => {};
console.warn = () => {};
console.error = () => {};
console.debug = () => {};

const nodeFs = await import("node:fs");
const fsMock = {
    ...nodeFs,
    createWriteStream: (fPath, options) => ({
        close: () => {},

        on: (event, callback) => {
            switch (event) {
                case "finish":
                    nodeFs.writeFileSync(fPath, path.basename(fPath), { encoding: "utf8" });
                    callback();
                    break;

                default:
                    break;
            }
        }
    })
};
td.replaceEsm("node:fs", fsMock);

/* eslint-disable camelcase */
const respData = [
    {
        meta: {
            msg: "OK",
            status: 200
        },
        response: {
            posts: [
                {
                    content: [
                        {
                            text: "data",
                            type: "text"
                        }
                    ],
                    id_string: "12345",
                    timestamp: 1298665620,
                    trail: []
                }
            ],
            total_posts: 1
        }
    },
    {
        meta: {
            msg: "OK",
            status: 200
        },
        response: {
            posts: [
                {
                    content: [
                        {
                            text: "Hey",
                            type: "text"
                        },
                        {
                            embed_iframe: {
                                height: 1024,
                                type: "video/mp4",
                                url: "https://va.media.tumblr.com/video.mp4",
                                width: 576
                            },
                            media: {
                                height: 1024,
                                type: "video/mp4",
                                url: "https://va.media.tumblr.com/video.mp4",
                                width: 576
                            },
                            provider: "tumblr",
                            type: "video"
                        },
                        {
                            provider: "whatever",
                            type: "video",
                            url: "https://va.media.whatever.com/whatever_video.mp4"
                        },
                        {
                            media: {
                                type: "audio/mpeg",
                                url: "https://va.media.tumblr.com/audio.mp3"
                            },
                            provider: "tumblr",
                            type: "audio"
                        },
                        {
                            provider: "whatever",
                            type: "audio",
                            url: "https://va.media.whatever.com/whatever_audio.mp3"
                        },
                        {
                            media: [
                                {
                                    height: 498,
                                    url: "https://64.media.tumblr.com/image_big.gif",
                                    width: 483
                                },
                                {
                                    height: 412,
                                    url: "https://64.media.tumblr.com/image_small.gif",
                                    width: 400
                                }
                            ],
                            type: "image"
                        }
                    ],
                    id_string: "12345",
                    timestamp: 1704218407,
                    trail: [
                        {
                            content: [
                                {
                                    text: "Hey",
                                    type: "text"
                                },
                                {
                                    embed_iframe: {
                                        height: 1024,
                                        type: "video/mp4",
                                        url: "https://va.media.tumblr.com/video_trail_embed.mp4",
                                        width: 576
                                    },
                                    media: {
                                        height: 1024,
                                        type: "video/mp4",
                                        url: "https://va.media.tumblr.com/video_trail.mp4",
                                        width: 576
                                    },
                                    provider: "tumblr",
                                    type: "video"
                                },
                                {
                                    provider: "whatever",
                                    type: "video",
                                    url: "https://va.media.whatever.com/whatever_video.mp4"
                                },
                                {
                                    media: {
                                        type: "audio/mpeg",
                                        url: "https://va.media.tumblr.com/audio_trail.mp3"
                                    },
                                    provider: "tumblr",
                                    type: "audio"
                                },
                                {
                                    provider: "whatever",
                                    type: "audio",
                                    url: "https://va.media.whatever.com/whatever_audio.mp3"
                                },
                                {
                                    media: [
                                        {
                                            height: 498,
                                            url: "https://64.media.tumblr.com/image_big_trail.gif",
                                            width: 483
                                        },
                                        {
                                            height: 412,
                                            url: "https://64.media.tumblr.com/image_small_trail.gif",
                                            width: 400
                                        }
                                    ],
                                    type: "image"
                                }
                            ],
                            id_string: "1234512345",
                            timestamp: 1704318407,
                            trail: [],
                            updated: 7
                        }
                    ],
                    updated: 3
                }
            ],
            total_posts: 1
        }
    }
];
let selectedRespData = -1;

const tokenRespData = {
    access_token: "1234",
    expires_in: 2520,
    refresh_token: "5678",
    scope: "write offline_access",
    token_type: "bearer"
};
/* eslint-enable camelcase */

const requestCalls = [];
const downloadCalls = [];

let httpsFailure = 0;
const FAILURE_ON_TOKEN_REQUEST_ERROR = 1;
const FAILURE_ON_TOKEN_REQUEST_TIMEOUT = 2;
const FAILURE_ON_TOKEN_REQUEST_STATUS_CODE = 3;
const FAILURE_ON_TOKEN_REQUEST_EMPTY_RESPONSE = 4;
const FAILURE_ON_POST_UNRECOVERABLE = 5;
const FAILURE_ON_POST_REQUEST_ERROR = 6;
const FAILURE_ON_POST_REQUEST_TIMEOUT = 7;
const FAILURE_ON_POST_REQUEST_STATUS_CODE = 8;
const FAILURE_ON_POST_REQUEST_UNAUTHORIZED = 9;
const FAILURE_ON_POST_REQUEST_EMPTY_RESPONSE = 10;
const FAILURE_ON_DOWNLOAD_WRONG_FILESIZE = 11;

let writtenData = "";
const nodeHttps = await import("node:https");
const httpsMock = {
    ...nodeHttps,
    request: (options, callback) => {
        switch (true) {
            case options.path === "/v2/oauth2/token":
                return {
                    destroy: () => {},

                    end: () => {
                        if (_.inRange(httpsFailure, FAILURE_ON_TOKEN_REQUEST_ERROR, FAILURE_ON_TOKEN_REQUEST_TIMEOUT + 1)) {
                            return;
                        }

                        timers.setTimeout(() => {
                            callback({
                                on: (event, respCallback) => {
                                    switch (event) {
                                        case "data":
                                            respCallback(
                                                httpsFailure === FAILURE_ON_TOKEN_REQUEST_EMPTY_RESPONSE
                                                    ? ""
                                                    : JSON.stringify(tokenRespData)
                                            );
                                            break;

                                        case "end":
                                            respCallback();
                                            break;

                                        default:
                                            break;
                                    }
                                },

                                setEncoding: (value) => {},

                                statusCode: httpsFailure === FAILURE_ON_TOKEN_REQUEST_STATUS_CODE ? 500 : 200
                            });
                        }, 1000);
                    },

                    on: (event, respCallback) => {
                        switch (event) {
                            case "error":
                                if (httpsFailure === FAILURE_ON_TOKEN_REQUEST_ERROR) {
                                    respCallback(new Error("request error"));
                                }
                                break;

                            case "timeout":
                                if (httpsFailure === FAILURE_ON_TOKEN_REQUEST_TIMEOUT) {
                                    respCallback(new Error("request timeout"));
                                }
                                break;

                            default:
                                break;
                        }
                    },

                    setTimeout: (timeout) => {
                    },

                    write: (data) => {
                        writtenData = data;
                    }
                };

            case options.path.startsWith("/v2/user/info"): {
                requestCalls.push(options.path);
                return {
                    destroy: () => {},

                    end: () => {
                        timers.setTimeout(() => {
                            callback({
                                on: (event, respCallback) => {
                                    switch (event) {
                                        case "data": {
                                            const lclRespData = {
                                                meta: {
                                                    msg: "OK",
                                                    status: 200
                                                },
                                                response: {
                                                    blogs: [
                                                        {
                                                            description: "Blog description",
                                                            followers: 200,
                                                            name: "blog_name",
                                                            posts: 200,
                                                            title: "Blog Title",
                                                            updated: 1234567890,
                                                            url: "https://blog_name.tumblr.com/"
                                                        }
                                                    ],
                                                    following: 30,
                                                    likes: 100,
                                                    name: "me"
                                                }
                                            };

                                            respCallback(JSON.stringify(lclRespData));
                                            return;
                                        }

                                        case "end":
                                            respCallback();
                                            break;

                                        default:
                                            break;
                                    }
                                },

                                setEncoding: (value) => {},

                                statusCode: 200
                            });
                        }, 1000);
                    },

                    on: (event, respCallback) => {
                    },

                    setTimeout: (timeout) => {
                    },

                    write: (data) => {
                    }
                };
            }

            case options.path.startsWith("/v2/blog/blog_name/posts?api_key=my_client_id&notes_info=true&npf=true&reblog_info=true"): {
                requestCalls.push(options.path);

                return {
                    destroy: () => {},

                    end: () => {
                        if (_.inRange(httpsFailure, FAILURE_ON_POST_REQUEST_ERROR, FAILURE_ON_POST_REQUEST_TIMEOUT + 1)) {
                            httpsFailure = 0;
                            return;
                        }

                        if (httpsFailure === FAILURE_ON_POST_UNRECOVERABLE) {
                            return;
                        }

                        timers.setTimeout(() => {
                            callback({
                                on: (event, respCallback) => {
                                    switch (event) {
                                        case "data":
                                            if (selectedRespData === 200) {
                                                /* eslint-disable camelcase */
                                                const params = querystring.parse(options.path.split("?")[1]);
                                                const limit = parseInt(params.limit, 10);
                                                const offset = parseInt(params.offset, 10);

                                                const lclRespData = {
                                                    meta: {
                                                        msg: "OK",
                                                        status: 200
                                                    },
                                                    response: {
                                                        posts: Array.from({ length: limit }, (__, i) => 1634535620 + 60 * (i + offset)).map(timestamp => (
                                                            {
                                                                content: [
                                                                    {
                                                                        text: "Hey",
                                                                        type: "text"
                                                                    }
                                                                ],
                                                                id_string: timestamp.toString(),
                                                                timestamp,
                                                                trail: []
                                                            }
                                                        )),
                                                        total_posts: 200
                                                    }
                                                };
                                                /* eslint-enable camelcase */

                                                respCallback(JSON.stringify(lclRespData));
                                                return;
                                            }

                                            respCallback(
                                                httpsFailure === FAILURE_ON_POST_REQUEST_EMPTY_RESPONSE
                                                    ? ""
                                                    : JSON.stringify(respData[selectedRespData])
                                            );
                                            break;

                                        case "end":
                                            respCallback();
                                            break;

                                        default:
                                            break;
                                    }
                                },

                                setEncoding: (value) => {},

                                statusCode:
                                    // eslint-disable-next-line no-nested-ternary
                                    httpsFailure === FAILURE_ON_POST_REQUEST_STATUS_CODE
                                        ? 500
                                        : httpsFailure === FAILURE_ON_POST_REQUEST_UNAUTHORIZED
                                            ? 401
                                            : 200
                            });

                            if (httpsFailure !== FAILURE_ON_DOWNLOAD_WRONG_FILESIZE) {
                                httpsFailure = 0;
                            }
                        }, 1000);
                    },

                    on: (event, respCallback) => {
                        switch (event) {
                            case "error":
                                if (httpsFailure === FAILURE_ON_POST_REQUEST_ERROR ||
                                    httpsFailure === FAILURE_ON_POST_UNRECOVERABLE) {
                                    respCallback(new Error("request error"));
                                }
                                break;

                            case "timeout":
                                if (httpsFailure === FAILURE_ON_POST_REQUEST_TIMEOUT) {
                                    respCallback(new Error("timeout"));
                                }
                                break;

                            default:
                                break;
                        }
                    },

                    setTimeout: (timeout) => {
                    },

                    write: (data) => {

                    }
                };
            }

            default:
                if (options.path.endsWith(".mp4") || options.path.endsWith(".mp3") || options.path.endsWith(".gif")) {
                    downloadCalls.push(options.path);
                    return {
                        end: () => {
                            timers.setTimeout(() => {
                                callback({
                                    destroy: () => {},

                                    headers: {
                                        "content-length":
                                            httpsFailure === FAILURE_ON_DOWNLOAD_WRONG_FILESIZE
                                                ? 1
                                                : path.basename(options.path).length
                                    },

                                    pipe: (stream) => {},

                                    statusCode: 200
                                });
                                httpsFailure = 0;
                            }, 1000);
                        },

                        on: (event, respCallback) => {
                            switch (event) {
                                case "error":
                                    break;

                                case "timeout":
                                    break;

                                default:
                                    break;
                            }
                        },

                        setTimeout: (timeout) => {
                        }
                    };
                }

                return {};
        }
    }
};
td.replaceEsm("node:https", httpsMock);

import { expect } from "chai";

function importModule() {
    return import(`../dist/main.js?version=${Date.now()}`);
}

describe("tests", () => {
    before(() => {
        process.env.CLIENT_ID = "my_client_id";
        process.env.CLIENT_SECRET = "my_client_secret";

        try {
            nodeFs.rmSync(path.join(process.env.RUNNER_TEMP ?? "", "folder_name"), { force: true, recursive: true });
        } catch (err) {

        }
    });

    beforeEach(() => {
        requestCalls.length = 0;

        process.argv = [
            "node", "main.js",
            "--folder", path.join(process.env.RUNNER_TEMP ?? "", "folder_name")
        ];
    });

    it("no args", async () => {
        try {
            process.argv = ["node", "main.js"];
            await importModule();
            expect.fail("this must throw");
        } catch (err) {
            expect(err.message).to.be.equal("Missing required argument: folder");
        }
    });

    it("first token request", async () => {
        selectedRespData = 0;
        process.env.CODE = "my_code";
        process.env.REDIRECT_URI = "http://localhost:3000";

        await importModule();

        expect(querystring.parse(writtenData)).to.be.deep.equal({
            /* eslint-disable camelcase */
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            code: process.env.CODE,
            grant_type: "authorization_code",
            redirect_uri: process.env.REDIRECT_URI
            /* eslint-enable camelcase */
        });

        expect(nodeFs.readFileSync(
            path.join(process.env.RUNNER_TEMP, "folder_name", "blog_name", "2011", "02", "25", "12345.json"),
            { encoding: "utf8" }
        )).to.be.equal(JSON.stringify(respData[selectedRespData].response.posts[0], null, 2));

        const diskToken = JSON.parse(nodeFs.readFileSync(
            path.join(process.env.RUNNER_TEMP, "folder_name", "token.json"),
            { encoding: "utf8" }
        ));
        delete diskToken.requested;
        expect(diskToken).to.be.deep.equal(tokenRespData);
    });

    it("re-use token", async () => {
        selectedRespData = 0;
        writtenData = "";

        await importModule();

        expect(writtenData).to.be.equal("");

        expect(nodeFs.readFileSync(
            path.join(process.env.RUNNER_TEMP, "folder_name", "blog_name", "2011", "02", "25", "12345.json"),
            { encoding: "utf8" }
        )).to.be.equal(JSON.stringify(respData[selectedRespData].response.posts[0], null, 2));
    });

    it("refresh token", async () => {
        selectedRespData = 0;
        writtenData = "";

        const token = JSON.parse(nodeFs.readFileSync(path.join(process.env.RUNNER_TEMP, "folder_name", "token.json"), { encoding: "utf8" }));
        const prevRequested = token.requested;
        token.requested -= token.expires_in + 40;
        nodeFs.writeFileSync(path.join(process.env.RUNNER_TEMP, "folder_name", "token.json"), JSON.stringify(token), { encoding: "utf8" });

        await importModule();
        expect(querystring.parse(writtenData)).to.be.deep.equal({
            /* eslint-disable camelcase */
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            grant_type: "refresh_token",
            refresh_token: token.refresh_token
            /* eslint-enable camelcase */
        });

        expect(nodeFs.readFileSync(
            path.join(process.env.RUNNER_TEMP, "folder_name", "blog_name", "2011", "02", "25", "12345.json"),
            { encoding: "utf8" }
        )).to.be.equal(JSON.stringify(respData[selectedRespData].response.posts[0], null, 2));

        const diskToken = JSON.parse(nodeFs.readFileSync(
            path.join(process.env.RUNNER_TEMP, "folder_name", "token.json"),
            { encoding: "utf8" }
        ));

        expect(diskToken.requested).to.be.greaterThan(prevRequested);
    });

    it("create a backup if the post changes", async () => {
        selectedRespData = 0;
        writtenData = "";

        const oldPost = JSON.parse(nodeFs.readFileSync(
            path.join(process.env.RUNNER_TEMP, "folder_name", "blog_name", "2011", "02", "25", "12345.json"),
            { encoding: "utf8" }
        ));

        oldPost.content[0].text = "old data";
        nodeFs.writeFileSync(
            path.join(process.env.RUNNER_TEMP, "folder_name", "blog_name", "2011", "02", "25", "12345.json"),
            JSON.stringify(oldPost, null, 2),
            { encoding: "utf8" }
        );

        await importModule();

        expect(nodeFs.readFileSync(
            path.join(process.env.RUNNER_TEMP, "folder_name", "blog_name", "2011", "02", "25", "12345.json"),
            { encoding: "utf8" }
        )).to.be.equal(JSON.stringify(respData[selectedRespData].response.posts[0], null, 2));

        expect(nodeFs.readFileSync(
            path.join(process.env.RUNNER_TEMP, "folder_name", "blog_name", "2011", "02", "25", "12345.json.bak"),
            { encoding: "utf8" }
        )).to.be.equal(JSON.stringify(oldPost, null, 2));
    });

    it("post has some media items, download them", async () => {
        selectedRespData = 1;
        writtenData = "";

        await importModule();

        const post = _.cloneDeep(respData[selectedRespData].response.posts[0]);
        delete post.updated;
        delete post.content[1].embed_iframe;

        delete post.trail[0].updated;
        delete post.trail[0].content[1].embed_iframe;

        expect(nodeFs.readFileSync(
            path.join(process.env.RUNNER_TEMP, "folder_name", "blog_name", "2024", "01", "02", "12345.json"),
            { encoding: "utf8" }
        )).to.be.equal(JSON.stringify(post, null, 2));

        expect(nodeFs.readFileSync(
            path.join(process.env.RUNNER_TEMP, "folder_name", "blog_name", "2024", "01", "02", "12345", "audio.mp3"),
            { encoding: "utf8" }
        )).to.be.equal("audio.mp3");

        expect(nodeFs.readFileSync(
            path.join(process.env.RUNNER_TEMP, "folder_name", "blog_name", "2024", "01", "02", "12345", "video.mp4"),
            { encoding: "utf8" }
        )).to.be.equal("video.mp4");

        expect(nodeFs.readFileSync(
            path.join(process.env.RUNNER_TEMP, "folder_name", "blog_name", "2024", "01", "02", "12345", "image_big.gif"),
            { encoding: "utf8" }
        )).to.be.equal("image_big.gif");

        expect(nodeFs.readFileSync(
            path.join(process.env.RUNNER_TEMP, "folder_name", "blog_name", "2024", "01", "02", "12345", "audio_trail.mp3"),
            { encoding: "utf8" }
        )).to.be.equal("audio_trail.mp3");

        expect(nodeFs.readFileSync(
            path.join(process.env.RUNNER_TEMP, "folder_name", "blog_name", "2024", "01", "02", "12345", "video_trail.mp4"),
            { encoding: "utf8" }
        )).to.be.equal("video_trail.mp4");

        expect(nodeFs.readFileSync(
            path.join(process.env.RUNNER_TEMP, "folder_name", "blog_name", "2024", "01", "02", "12345", "image_big_trail.gif"),
            { encoding: "utf8" }
        )).to.be.equal("image_big_trail.gif");
    });

    it("fetch 200 posts", async () => {
        selectedRespData = 200;
        writtenData = "";

        await importModule();

        const posts = nodeFs.readdirSync(path.join(process.env.RUNNER_TEMP, "folder_name", "blog_name", "2021", "10", "18"));
        expect(posts.length).to.be.equal(200);
        expect(_.minBy(posts, item => parseInt(item.split(".")[0], 10))).to.be.equal("1634535620.json");
        expect(_.maxBy(posts, item => parseInt(item.split(".")[0], 10))).to.be.equal("1634547560.json");
    });

    it("stop after 100, there are no changes", async () => {
        selectedRespData = 200;
        writtenData = "";

        await importModule();
        expect(requestCalls.length).to.be.equal(7);
    });

    it("always full backup in forced mode", async () => {
        selectedRespData = 200;
        writtenData = "";
        process.argv.push("--force");

        await importModule();
        expect(requestCalls.length).to.be.equal(11);
    });

    describe("network failures", () => {
        before(() => {
            process.env.CODE = "my_code";
            process.env.REDIRECT_URI = "http://localhost:3000";
            selectedRespData = 0;
        });

        beforeEach(() => {
            requestCalls.length = 0;
            downloadCalls.length = 0;

            try {
                nodeFs.rmSync(path.join(process.env.RUNNER_TEMP ?? "", "folder_name"), { force: true, recursive: true });
            } catch (err) {

            }
        });

        it("token request error", async () => {
            try {
                httpsFailure = FAILURE_ON_TOKEN_REQUEST_ERROR;

                await importModule();
                expect.fail("this must throw");
            } catch (err) {
                expect(err.message).to.be.equal("request error, Error: request error");
            }
        });

        it("token request timeout", async () => {
            try {
                httpsFailure = FAILURE_ON_TOKEN_REQUEST_TIMEOUT;

                await importModule();
                expect.fail("this must throw");
            } catch (err) {
                expect(err.message).to.be.equal("timeout");
            }
        });

        it("token request status code error", async () => {
            try {
                httpsFailure = FAILURE_ON_TOKEN_REQUEST_STATUS_CODE;

                await importModule();
                expect.fail("this must throw");
            } catch (err) {
                expect(err.message).to.be.equal("response error, 500");
            }
        });

        it("token request empty response", async () => {
            try {
                httpsFailure = FAILURE_ON_TOKEN_REQUEST_EMPTY_RESPONSE;

                await importModule();
                expect.fail("this must throw");
            } catch (err) {
                expect(err.message).to.be.equal("no data received");
            }
        });

        it("post request unrecoverable error", async () => {
            httpsFailure = FAILURE_ON_POST_UNRECOVERABLE;

            try {
                await importModule();
                expect.fail("this must throw");
            } catch (err) {
                expect(err.message).to.be.equal("There were errors during the backup process");
            }
        });

        it("post request error", async () => {
            httpsFailure = FAILURE_ON_POST_REQUEST_ERROR;

            await importModule();

            expect(requestCalls.length).to.be.equal(3);
            expect(requestCalls[1]).to.be.equal(requestCalls[2]);
        });

        it("post request timeout", async () => {
            httpsFailure = FAILURE_ON_POST_REQUEST_TIMEOUT;

            await importModule();

            expect(requestCalls.length).to.be.equal(3);
            expect(requestCalls[1]).to.be.equal(requestCalls[2]);
        });

        it("post request status code error", async () => {
            httpsFailure = FAILURE_ON_POST_REQUEST_STATUS_CODE;

            await importModule();

            expect(requestCalls.length).to.be.equal(3);
            expect(requestCalls[1]).to.be.equal(requestCalls[2]);
        });

        it("post request unauthorized error", async () => {
            httpsFailure = FAILURE_ON_POST_REQUEST_UNAUTHORIZED;

            await importModule();

            expect(requestCalls.length).to.be.equal(3);
            expect(requestCalls[1]).to.be.equal(requestCalls[2]);
        });

        it("post request empty response", async () => {
            httpsFailure = FAILURE_ON_POST_REQUEST_EMPTY_RESPONSE;

            await importModule();

            expect(requestCalls.length).to.be.equal(3);
            expect(requestCalls[1]).to.be.equal(requestCalls[2]);
        });

        it("post media download failure", async () => {
            httpsFailure = FAILURE_ON_DOWNLOAD_WRONG_FILESIZE;
            selectedRespData = 1;

            await importModule();

            expect(downloadCalls.length).to.be.equal(7);
            expect(downloadCalls[0]).to.be.equal(downloadCalls[1]);
        });
    });
});
