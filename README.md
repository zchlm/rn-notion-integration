# Getting started
Clone the repository using Heroku

```bash
git clone git@github.com:zchlm/rn-notion-integration.git
```

Create a new app on Heroku (https://devcenter.heroku.com/articles/creating-apps)

```bash
cd rn-notion-integration
heroku create rn-notion-integration
```

If the Heroku app is named differently, use `-a <app_name>` to specify it on all following Heroku commands.

Set config variables
```bash
heroku config:set CLIENT_SECRET=<client token>
heroku config:set RATIONAL_SECRET=<rational token>
heroku config:set RATIONAL_TASK_TEMPLATE_PAGE_ID=<page id>
heroku config:set RATIONAL_DATABASE_ID=<database id>
heroku config:set CLIENT_DATABASE_ID=<database id>
heroku config:set CLIENT_BOT_USER_ID=<user id>
```
```dotenv
# https://www.notion.so/<workspace>/<database id>?v=...
# https://www.notion.so/<workspace>/<page id>#<block id>
```

Follow Heroku app logs to see what is happening
```bash
heroku logs -t
```

Push code to Heroku app
```bash
git push heroku
```

Stop the default web dyno and start worker dyno
```bash
heroku ps:scale web=0
heroku ps:scale worker=1
```

If there's an error, you can restart the worker dyno
```bash
heroku ps:restart
```
