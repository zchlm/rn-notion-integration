import * as cron from "cron"
import { main } from "./index"

const job = new cron.CronJob(
  "*/1 * * * *",
  async function () {
    console.log("You will see this message every minute")
    await main()
  },
  null,
  true,
  "UTC"
)
