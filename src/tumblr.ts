import type * as https from "./https.js";
import * as querystring from "node:querystring";

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
    [key: string]: unknown;
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
    public constructor(private readonly handler: https.Handler) {
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
        const params = querystring.stringify({
            // eslint-disable-next-line camelcase
            api_key: process.env.CLIENT_ID,
            ...parameters ?? {}
        });

        console.debug(`calling API: /v2/${api}?${params}`);

        const jsonData = await this.handler.get({
            path: `/v2/${api}?${params}`
        });

        const result = JSON.parse(jsonData) as Response<T>;
        return result.response;
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

            /* c8 ignore start */
            default:
                if (globalParameters.limit <= newValues.length) {
                    return newValues.slice(0, globalParameters.limit);
                }
                break;
            /* c8 ignore stop */
        }

        const newParams = { ...localParameters };
        newParams.offset = globalParameters.offset + newValues.length;
        newParams.limit = 20;
        return values.length === 0 ? newValues : this.doApiArrayCall(api, newValues, support, globalParameters, newParams);
    }
}
