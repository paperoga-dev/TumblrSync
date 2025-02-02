import * as fs from "node:fs/promises";
import * as https from "./https.js";
import * as path from "node:path";
import * as querystring from "node:querystring";
import * as timers from "node:timers";

interface Token {
    access_token: string;
    token_type: string;
    requested: number;
    expires_in: number;
    refresh_token: string;
    scope: string;
}

interface Response<T> {
    meta: {
        status: number;
        msg: string;
    };
    response: T;
}


interface ArraySupport<T> {
    totalKey: string;
    valuesKey: string;
    keyIndex: string;
    keys: Set<string>;
    process?: (latest: T[]) => Promise<void>;
}

export interface Blog {
    followers: number;
    name: string;
    description: string;
    posts: number;
    title: string;
    updated: number;
    url: string;
}

export interface User {
    name: string;
    likes: number;
    following: number;
    blogs: Blog[];
}

export interface Info {
    user: User;
}

export interface Contact {
    name: string;
    url: string;
    updated: number;
}

export interface ContentItem {
    [key: string]: unknown;
    type: string;
}

export interface MediaItem {
    [key: string]: unknown;
    url: string;
    type: string;
    width?: number;
    height?: number;
    original_dimensions_missing?: boolean;
    cropped?: boolean;
    has_original_dimensions?: boolean;
}

export interface ImageItem extends ContentItem {
    type: "image";
    media: MediaItem[];
}

export interface AudioItem extends ContentItem {
    type: "audio";
    media: MediaItem;
    provider: string;
}

export interface VideoItem extends ContentItem {
    type: "video";
    media: MediaItem;
    provider: string;
}

export type BackuppableItem = ImageItem | AudioItem | VideoItem;

interface TrailItem {
    content: BackuppableItem[];
}

export interface Post {
    [key: string]: unknown;
    id_string: string;
    timestamp: number;
    content: BackuppableItem[];
    trail: TrailItem[];
}

type QueryParams = Record<string, number | string | boolean>;
type ArrayQueryParams = QueryParams & {
    limit: number;
    offset: number;
};

export class Client {
    private readonly tokenPath: string;
    private token: Token | undefined = undefined;
    private lastCall: number | undefined = undefined;

    public constructor(appPath: string) {
        this.tokenPath = path.join(appPath, "token.json");
    }

    public async apiArrayCall<T extends Record<string, unknown>>(
        api: string, support: ArraySupport<T>, parameters?: QueryParams
    ): Promise<T[]> {
        const newParams = { ...parameters ?? {} };
        if (!Object.hasOwn(newParams, "limit")) {
            newParams.limit = -1;
        }

        if (!Object.hasOwn(newParams, "offset")) {
            newParams.offset = 0;
        }

        const localParams = { ...newParams } as ArrayQueryParams;
        localParams.limit = 20;

        const res = await this.doApiArrayCall(api, [], support, newParams as ArrayQueryParams, localParams);
        return res;
    }

    public async apiCall<T extends Record<string, unknown>>(api: string, parameters?: QueryParams): Promise<T> {
        await this.fetchToken();

        const current = Date.now();
        if (this.lastCall && current - this.lastCall < 2000) {
            await new Promise((resolve) => {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                timers.setTimeout(resolve, current - this.lastCall!);
            });
        }
        this.lastCall = current;

        const params = querystring.stringify({
            // eslint-disable-next-line camelcase
            api_key: process.env.CLIENT_ID,
            ...parameters ?? {}
        });

        console.debug(`calling API: /v2/${api}?${params}`);

        try {
            const jsonData = await https.get({
                headers: {
                    Authorization: `Bearer ${this.token?.access_token}`
                },
                path: `/v2/${api}?${params}`
            });
            const result = JSON.parse(jsonData) as Response<T>;
            return result.response;
        } catch (err) {
            if (err instanceof https.TokenError) {
                await this.fetchToken(true);
                return this.apiCall(api, parameters);
            }

            throw err;
        }
    }

    private async doApiArrayCall<T extends Record<string, unknown>>(
        api: string, prev: T[], support: ArraySupport<T>, globalParameters: ArrayQueryParams, localParameters: ArrayQueryParams
    ): Promise<T[]> {
        const data = await this.apiCall<Record<PropertyKey, unknown>>(api, localParameters);

        const total = data[support.totalKey] as number;
        const values = (data[support.valuesKey] as T[]).filter(value => !support.keys.has(value[support.keyIndex] as string));
        for (const value of values) {
            support.keys.add(value[support.keyIndex] as string);
        }

        const newValues = [
            ...prev,
            ...values
        ];

        await support.process?.(values);

        switch (globalParameters.limit) {
            case -1:
                if (newValues.length >= total) {
                    return newValues.slice(0, total);
                }
                break;

            default:
                if (globalParameters.limit <= newValues.length) {
                    return newValues.slice(0, globalParameters.limit);
                }
                break;
        }

        const newParams = { ...localParameters };
        newParams.offset = globalParameters.offset + newValues.length;
        newParams.limit = 20;
        return values.length === 0 ? newValues : this.doApiArrayCall(api, newValues, support, globalParameters, newParams);
    }

    private async getNewToken(refreshToken?: string): Promise<Token> {
        /* eslint-disable camelcase */
        const tokenData = querystring.stringify({
            ...{
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                grant_type: refreshToken ? "refresh_token" : "authorization_code"
            },
            ...refreshToken
                ? { refresh_token: refreshToken }
                : {
                    code: process.env.CODE,
                    redirect_uri: process.env.REDIRECT_URI
                }
        });
        /* eslint-enable camelcase */

        const authData = await https.post({
            path: "/v2/oauth2/token"
        }, tokenData);

        const token = JSON.parse(authData) as Partial<Token>;
        token.requested = Math.trunc(Date.now() / 1000);
        await fs.writeFile(this.tokenPath, JSON.stringify(token), { encoding: "utf-8" });
        return token as Token;
    }

    private async fetchToken(forceRefresh?: boolean): Promise<void> {
        try {
            if (!this.token) {
                this.token = JSON.parse(await fs.readFile(this.tokenPath, { encoding: "utf-8" })) as Token;
            }

            if (forceRefresh === true || this.token.requested + this.token.expires_in < Math.trunc(Date.now() / 1000) - 30) {
                console.warn("\tToken expired, refreshing...");
                this.token = await this.getNewToken(this.token.refresh_token);
            }
        } catch (ignoreErr) {
            await this.getNewToken();
            await this.fetchToken();
        }
    }
}
