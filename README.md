# Getting started
Clone the repository using Heroku

```bash
git clone git@github.com:zchlm/rn-notion-integration.git
```

Create new app on Heroku (https://devcenter.heroku.com/articles/creating-apps)

```bash
cd rn-notion-integration
heroku create rn-notion-integration
```

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

# TODO
See Loom video here for more details:
