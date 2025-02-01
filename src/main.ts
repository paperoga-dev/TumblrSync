import * as tumblr from "./tumblr";

const client = new tumblr.Client("/tmp");

const info = await client.apiCall<tumblr.Info>("user/info");

console.log(info.user.name);
