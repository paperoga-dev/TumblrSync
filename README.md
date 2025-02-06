# TumblrSync

TumblrSync is a node tool that can perform a full backup of a Tumblr blog. It saves the whole content using a blog/year/month/day directory pattern, in each of them a full JSON dump of the tumblr post is saved and, if it contains media, a separate subfolder with the same post ID hosts it.

To use it, you need Node 22.x installed on your system (could work with 20.x, though).

Once cloned the repo:

- npm ci
- npm run package

in the dist folder your should have your app, `main.js`.

To use it you need to ask for a Tumblr key [here](https://www.tumblr.com/oauth/apps). Just fill all the mandatory fields as you wish, please use `http://localhost:3000` as a callback URL.

You should now have a couple of values, the Consumer Key and the Consumer Secret.

Execute `authorize.sh <your_consumer_key>`, you should see a browser opening the main Tumblr page, it could ask for your username and password, and then for the app authorization. Once approved, you get back to an unreachable host, with the following URL:

`http://localhost:3000/?code=CODE_KEY&state=IT_DOESN_T_MATTER#_=_`

Note down the CODE_KEY, and create a `.env` file, with the following content:

```text
CLIENT_ID=<your_consumer_key>
CLIENT_SECRET=<your_consumer_secret>
CODE=<your_code_key>
REDIRECT_URI=http://localhost:3000/
```

To start the backup, just execute, from the repo folder root,

`node --env-file=<path_of_your_env_file> dist/main.js --blog <blog_name> --folder <target_backup_folder>`

The .env file must not be changed anymore, unless Tumblr rejects your token and you need to authorize again.

A new start will just fetch the latest 100 posts, updating the content in case a change is detected.

If you wish to redo a full backup, add the `--force` parameter.
