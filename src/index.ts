import { fetchRationalTasksLinked, getBlockChildren } from "./utils"
import { Client as NotionClient } from "@notionhq/client"
import moment from "moment"
import util from "util"
import {
  clientBotUserID,
  clientDatabaseId,
  clientSecret,
  rationalDatabaseId,
  rationalSecret,
  rationalTaskTemplatePageId,
} from "./config"
import Database from "better-sqlite3"

// Construct our notion API client instance
const notion = new NotionClient()

// Setup database

// const db = new Database("notion.db", { verbose: console.log })

// https://www.notion.so/<workspace>/<database id>?v=...

// https://www.notion.so/<workspace>/<page id>#<block id>
// const calloutBlockId = "<The ID of the callout block we want to sync>";

// const today = moment()

// todo: within minute changes and sync doesn't work
// todo: solution: if they are same time, full update and set last sync to time + 1 minute or something else and we need another conditional to filter out!

function mapTasks(tasks) {
  return tasks.map((task) => {
    const d1 = moment(task.properties["Last Synced"].date.start).utc()
    const d2 = moment(task.properties["Last Edit"].last_edited_time).utc()
    const nowDiff = d2.diff(moment(), "minutes")

    if (d2.isSame(d1) && nowDiff < 0 && nowDiff >= -2) {
      task.sync_again = true // This is mutating the task object
    }
    return task
  })
}
// Tasks that need syncing!
function filterTasks(tasks) {
  // console.log("-- Filter tasks -- ")
  // map

  return tasks.filter((task) => {
    // console.log(util.inspect(task.properties, false, null, true))

    // @ts-ignore
    // if (!task.properties["Last Synced"].date) {
    //   return true
    // }

    const d1 = moment(task.properties["Last Synced"].date.start).utc()
    const d2 = moment(task.properties["Last Edit"].last_edited_time).utc()

    // console.log(d2, d1)
    // console.log(d2.isSame(d1))
    // console.log(d2.diff(d1, "minutes"))
    // const nowDiff = d2.diff(moment(), "minutes")
    // console.log(nowDiff)
    if (task.sync_again) {
      return true
    }

    if (d2.diff(d1, "minutes") == -1 || d2.isSame(d1)) {
      //   // todo: now filter tasks that aren't synced when updating time!
      //   task.synced = true
      //   return true
      return false
    }

    // return true

    // todo: issue lies in filtering
    // todo: need to reset this to false

    // console.log(d2.diff(moment(), "minutes"))
    // console.log(d2.diff(d1, "minutes"))
    // if (d2.diff(d1, "minutes") <= 1) {

    // else if (d2.isSame(d1)) {
    //   // task.check_contents = true // This is mutating the task object
    //   return true
    // }

    return true
  })
}

async function retrieveClientTasks(notion: NotionClient) {
  const { results: tasks } = await notion.databases.query({
    auth: clientSecret,
    database_id: clientDatabaseId,

    filter: {
      and: [
        {
          property: "Assigned To",
          people: { contains: clientBotUserID },
        },
      ],
    },
  })

  // todo: timing needs to work so that client can finish writing task before it's synced

  return tasks ? tasks : null
}

/*
 * clientTasks: Tasks that have changed since last sync
 * RNTasks: Tasks that we sync to
 * */
async function syncTasksWithRN(clientTasks, RNTasks) {
  // Fetch all tasks from the RN database
  // const rationalTasks = await fetchRationalTasksLinked(notion, clientTasks)

  // console.log(util.inspect(clientTasks, false, null, true))
  // console.log(util.inspect(RNTasks, false, null, true))
  // return

  // Loop through each client task
  // if (false) {

  for (const cTask of clientTasks) {
    // // Get client task children
    // const blocksCTask = await getBlockChildren(
    //   notion,
    //   clientSecret,
    //   cTask.id,
    //   true,
    //   true
    // )

    // const dBlock = db
    //   .prepare("SELECT data FROM blocks WHERE id = ?")
    //   .pluck()
    //   .get(cTask.id)
    //
    // // This task has same last edit and sync time
    // if (dBlock) {
    //   // Check child block length to see if changed
    //   // SKip item when nothing has changed
    //   if (cTask.check_contents && dBlock === JSON.stringify(blocksCTask)) {
    //     continue
    //   }
    //
    //   // todo: update
    //   // const update = db
    //   //   .prepare("INSERT INTO blocks (id, data) VALUES (?, json(?))")
    //   //   .run(cTask.id, JSON.stringify(blocksCTask))
    // } else {
    //   // Always insert task into database
    //   const insert = db
    //     .prepare("INSERT INTO blocks (id, data) VALUES (?, json(?))")
    //     .run(cTask.id, JSON.stringify(blocksCTask))
    // }

    // todo: do below, only if task has same time!

    // console.log(dBlock)
    // console.log(util.inspect(blocksCTask, false, null, true))

    //
    // const stmt = db.prepare("SELECT data FROM blocks").get()
    // console.log(stmt)
    // return
    // Check if contents have changed sync last sync

    // Update task in RN

    // Need to match with RN Tasks
    const RNTask = RNTasks.find((task) => {
      return (
        // @ts-ignore
        task.properties["Client Task ID"].rich_text[0].plain_text ===
        // @ts-ignore
        cTask.properties["ID"].formula.string
      )
    })

    // Find Rational block id to update
    // const { results: rationalTasks } = await notion.databases.query({
    //   auth: rationalSecret,
    //   database_id: rationalDatabaseId,
    //   page_size: 1,
    //   // Only load pages with matching date
    //   filter: {
    //     // @ts-ignore
    //     rich_text: { equals: task.properties["ID"].formula.string },
    //     property: "Client Task ID",
    //   },
    // })

    const blocksRN = await getBlockChildren(
      notion,
      rationalSecret,
      RNTask.id,
      false,
      true
    )

    const briefRNBlock = blocksRN.find((b) => {
      return b.type === "toggle" && b.toggle.text[0].plain_text.match(/Brief/)
    })

    // Delete brief toggle children
    if (briefRNBlock.toggle && briefRNBlock.toggle.children) {
      for (const block of briefRNBlock.toggle.children) {
        await notion.blocks.delete({
          auth: rationalSecret,
          block_id: block.id,
        })
      }
    }

    // console.log(util.inspect(briefRNBlock, false, null, true));

    // Get brief block from client
    const blocksClient = await getBlockChildren(
      notion,
      clientSecret,
      cTask.id,
      true,
      true
    )

    const briefClientBlock = blocksClient.find((b) => {
      return b.type === "toggle" && b.toggle.text[0].plain_text.match(/Brief/)
    })

    await notion.blocks.update({
      auth: rationalSecret,
      block_id: briefRNBlock.id,
      toggle: {
        text: [
          {
            type: "text",
            text: {
              content:
                "Brief (From Client) - Updated: " +
                moment().utc().startOf("minute").toISOString(),
            },
          },
        ],
      },
    })

    // Append brief update to block
    await notion.blocks.children.append({
      auth: rationalSecret,
      block_id: briefRNBlock.id,
      // @ts-ignore
      children: briefClientBlock.toggle.children,
    })

    console.log("Sync with RN", cTask, RNTask)

    // We also need to update client task last synced!
    await notion.pages.update({
      page_id: cTask.id,
      auth: clientSecret,
      // @ts-ignore
      properties: {
        "Last Synced": {
          date: {
            start: moment().utc().add(1, "minute").toISOString(),
            // cTask.sync_again
            // ?
            // : moment().utc().toISOString(),
          },
        },
      },
    })

    // Update rational task!
    // todo: update property "Last Synced" to current time here!
    console.log(`RN Full Sync: ${RNTask}`)
    await notion.pages.update({
      page_id: RNTask.id,
      auth: rationalSecret,
      // @ts-ignore
      properties: {
        "Last Synced": {
          date: {
            start: moment().utc().add(1, "minute").toISOString(),
            // RNTask.sync_again
            // ? moment().utc().add(0, "minute").toISOString()
            // : moment().utc().toISOString(),
          },
        },
      },
    })
  }

  // } else {
  //   // If there are no client tasks, we need to update RN tasks time to reflect
  //   for (const task of RNTasks) {
  //     await notion.pages.update({
  //       page_id: task.id,
  //       auth: rationalSecret,
  //       // @ts-ignore
  //       properties: {
  //         "Last Synced": {
  //           date: {
  //             start: task.full_sync
  //               ? moment().utc().add(1, "minute").toISOString()
  //               : moment().utc().toISOString(),
  //           },
  //         },
  //       },
  //     })
  //   }
  // }

  // Full sync
  // await updatePageProps(
  //   notion,
  //   clientSecret,
  //   clientTasks.filter((t) => t.full_sync),
  //   {
  //     "Last Synced": {
  //       date: {
  //         start: moment().utc().add(1, "minute").toISOString(),
  //       },
  //     },
  //   }
  // )

  // Last synced from client
  // await updatePageProps(
  //   notion,
  //   clientSecret,
  //   clientTasks.filter((t) => !t.full_sync),
  //   {
  //     "Last Synced": {
  //       date: {
  //         start: moment().utc().toISOString(),
  //       },
  //     },
  //   }
  // )
}

async function syncTasksWithClient(RNTasks, clientTasks) {
  // if (RNTasks.length < 1) {
  //   return
  // }

  // Todo: can we re-use these?
  // const clientTasks = await fetchClientTasksLinked(notion, RNTasks)

  // Todo: Can't send roll up field. Update progress field when they use 'Rollup' type. Create formula which references this roll

  // console.log(util.inspect(RNTasks, false, null, true))
  // return

  // if (RNTasks.length > 0) {
  for (const RNTask of RNTasks) {
    // Need to match with RN Tasks
    const clientTask = clientTasks.find((cTask) => {
      return (
        // @ts-ignore
        RNTask.properties["Client Task ID"].rich_text[0].plain_text ===
        // @ts-ignore
        cTask.properties["ID"].formula.string
      )
    })
    // console.log(util.inspect(clientTask, false, null, true))
    // return

    const blocksRN = await getBlockChildren(
      notion,
      rationalSecret,
      RNTask.id,
      true,
      true
    )

    const deliverableRNBlock = blocksRN.find((b) => {
      return (
        b.type === "toggle" && b.toggle.text[0].plain_text.match(/Deliverable/)
      )
    })

    // todo: just realised same issue occurs.....

    if (deliverableRNBlock) {
      // Send deliverable back to client
      const blocksClient = await getBlockChildren(
        notion,
        clientSecret,
        clientTask.id,
        true,
        true
      )

      const deliverableClientBlock = blocksClient.find((b) => {
        return (
          b.type === "toggle" &&
          b.toggle.text[0].plain_text.match(/Deliverable/)
        )
      })

      // Delete brief toggle children
      if (
        deliverableClientBlock &&
        deliverableClientBlock.toggle &&
        deliverableClientBlock.toggle.children
      ) {
        for (const block of deliverableClientBlock.toggle.children) {
          await notion.blocks.delete({
            auth: clientSecret,
            block_id: block.id,
          })
        }

        await notion.blocks.update({
          auth: clientSecret,
          block_id: deliverableClientBlock.id,
          toggle: {
            text: [
              {
                type: "text",
                text: {
                  content:
                    "Deliverables (From Rational Nomads) - Updated: " +
                    moment().utc().startOf("minute").toISOString(),
                },
              },
            ],
          },
        })

        // Append deliverables to block
        await notion.blocks.children.append({
          auth: clientSecret,
          block_id: deliverableClientBlock.id,
          // @ts-ignore
          children: deliverableRNBlock.toggle.children,
        })
      } else {
        // Create toggle block
        await notion.blocks.children.append({
          auth: clientSecret,
          block_id: clientTask.id,
          // @ts-ignore
          children: [
            {
              toggle: {
                text: [
                  {
                    type: "text",
                    text: {
                      content:
                        "Deliverables (From Rational Nomads) - Updated: " +
                        moment().utc().startOf("minute").toISOString(),
                    },
                  },
                ],
                children: deliverableRNBlock.toggle.children,
              },
            },
          ],
        })
      }
    }

    // Update properties last
    const propertiesToUpdate = ["Due Date", "Progress"]

    console.log("Sync with client", clientTask, RNTask)
    // Update Client time as we are changing it
    const propertySchemas = {
      "Last Synced": {
        date: {
          start: moment().utc().add(1, "minute").toISOString(),
          // clientTask.sync_again
          // ? moment().utc().add(1, "minute").toISOString()
          // : moment().utc().toISOString(),
        },
      },
    }

    propertiesToUpdate.forEach((prop) => {
      propertySchemas[prop] = {
        ...RNTask.properties[prop],
      }
    })

    await notion.pages.update({
      page_id: clientTask.id,
      auth: clientSecret,
      // @ts-ignore
      properties: propertySchemas,
    })

    // Also update RN sync time! As user has edited it!
    await notion.pages.update({
      page_id: RNTask.id,
      auth: rationalSecret,
      // @ts-ignore
      properties: {
        "Last Synced": {
          date: {
            start: moment().utc().add(1, "minute").toISOString(),
            // RNTask.sync_again
            // ?
            // : moment().utc().toISOString(),
          },
        },
      },
    })
  }
  // }

  // for (const task of clientTasks) {
  //   await notion.pages.update({
  //     page_id: task.id,
  //     auth: clientSecret,
  //     // @ts-ignore
  //     properties: {
  //       "Last Synced": {
  //         date: {
  //           start: task.full_sync
  //             ? moment().utc().add(1, "minute").toISOString()
  //             : moment().utc().toISOString(),
  //         },
  //       },
  //     },
  //   })
  // }

  /* // Full sync
  await updatePageProps(
    notion,
    rationalSecret,
    RNTasks.filter((t) => t.full_sync),
    {
      "Last Synced": {
        date: {
          start: moment().utc().add(1, "minute").toISOString(),
        },
      },
    }
  )

  await updatePageProps(
    notion,
    rationalSecret,
    RNTasks.filter((t) => !t.full_sync),
    {
      "Last Synced": {
        date: {
          start: moment().utc().toISOString(),
        },
      },
    }
  )*/
}

async function createTaskRN(notion: NotionClient, task) {
  // console.log(util.inspect(task, false, null, true))
  // console.log(task.properties["Name"].title[0].plain_text)
  // return;

  /*
   * 1. Create page
   * 2. Create database 'requirements' (from template)
   * 3. Append brief (from client) and template blocks
   **/
  const page = await notion.pages.create({
    auth: rationalSecret,
    parent: { database_id: rationalDatabaseId },
    properties: {
      "Client Task ID": {
        rich_text: [
          {
            text: {
              content: task.properties["ID"].formula.string,
            },
          },
        ],
      },
      Name: {
        title: [
          {
            text: {
              content: task.properties["Name"].title[0].plain_text,
            },
          },
        ],
      },
      "Last Synced": {
        date: {
          start: moment().toISOString(), // task edit time?
        },
      },
    },
  })

  // Template requirements database
  await notion.databases.create({
    auth: rationalSecret,
    parent: { page_id: page.id },
    title: [
      {
        type: "text",
        text: {
          content: "Requirements",
        },
      },
    ],
    properties: {
      Name: {
        title: {},
      },
      Done: {
        checkbox: {},
      },
    },
  })

  const templatePage = await notion.pages.retrieve({
    auth: rationalSecret,
    page_id: rationalTaskTemplatePageId,
  })

  const templateChildren = await getBlockChildren(
    notion,
    rationalSecret,
    templatePage.id,
    true,
    true,
    true
  )

  const blocks = await getBlockChildren(
    notion,
    clientSecret,
    task.id,
    true,
    true
  )

  // console.log(util.inspect(templateChildren, false, null, true));

  // Set client brief under toggle
  // const children = [
  //   {
  //     type: "toggle",
  //     toggle: {
  //       text: [
  //         {
  //           type: "text",
  //           text: {
  //             content: "Brief (From Client)",
  //           },
  //         },
  //       ],
  //       children: blocks,
  //     },
  //   },
  // ]
  const children = blocks.concat(templateChildren)

  // console.log(util.inspect(templateChildren, false, null, true))

  // Append to page
  const res = await notion.blocks.children.append({
    auth: rationalSecret,
    block_id: page.id,
    // @ts-ignore
    children: children,
  })

  // console.log(res)

  // todo: set as 'proposal' ?

  // return
}

// todo: now keep track of blocks with database!
export async function main() {
  // const insert = db.prepare("INSERT INTO blocks (id, data) VALUES (?, ?)")
  // insert.run("test")
  //
  // const stmt = db.prepare("SELECT data FROM blocks").get()
  // console.log(stmt)
  // return

  // todo: handle errors and write to error log
  const clientTasks = await retrieveClientTasks(notion)

  const rationalTasks = await fetchRationalTasksLinked(notion, clientTasks)

  // todo: need to support both, i.e. if 1 task is created and other is updated

  // Tasks that don't exist in RN database
  const tasksToCreateInRN = clientTasks.filter((task) => {
    return !rationalTasks.find(
      (t) =>
        // @ts-ignore
        t.properties["Client Task ID"].rich_text[0].plain_text ===
        // @ts-ignore
        task.properties["ID"].formula.string
    )
  })

  // console.log(util.inspect(tasksToCreateInRN, false, null, true))
  // return

  if (tasksToCreateInRN.length) {
    for (const task of tasksToCreateInRN) {
      await createTaskRN(notion, task)
      // console.log(result, tasks);
    }
  }

  const cTasks = mapTasks(clientTasks)
  const rTasks = mapTasks(rationalTasks)

  // Client tasks that have been updated
  const clientTasksFiltered = filterTasks(cTasks)

  // Tasks that are synced and need Last Synced time updated!
  /*  const clientTasksSynced = clientTasks.filter((t) => {
    // @ts-ignore
    const d1 = moment(task.properties["Last Synced"].date.start).utc()
    // @ts-ignore
    const d2 = moment(task.properties["Last Edit"].last_edited_time).utc()
    if (d2.diff(d1, "minutes") == -1) {
      // todo: now filter tasks that aren't synced when updating time!
      // task.synced = true
      return true
    }
  })*/

  // todo: reset full sync flag. Or handle both

  // RN tasks that have been updated
  const RNTasksFiltered = filterTasks(rTasks)

  // console.log(util.inspect(RNTasksFiltered, false, null, true))
  // console.log(util.inspect(clientTasksFiltered, false, null, true))
  // return

  // Client task has changed. Sync client to RN
  // todo: ok success!
  await syncTasksWithRN(clientTasksFiltered, rTasks)
  // return

  // Filter and update last synced
  // for (const task of RNTasksFiltered) {
  //   // Now synced!
  //   await notion.pages.update({
  //     page_id: task.id,
  //     auth: rationalSecret,
  //     // @ts-ignore
  //     properties: {
  //       "Last Synced": {
  //         date: {
  //           start: moment().utc().add(1, "minute").toISOString(),
  //         },
  //       },
  //     },
  //   })
  // }

  // todo Last edit and last sync will not work as we update the RN task.
  // todo What if we give leeway of 1-2 minutes?

  // RN task has changed. Sync RN to client.
  await syncTasksWithClient(RNTasksFiltered, cTasks)
  // return

  // Why can't we just update everything here?
  /*
  if (RNTasksFiltered.length <= 0) {
    // We all synced!
    for (const task of clientTasksFiltered) {
      console.log("Syncing client" + task)
      await notion.pages.update({
        page_id: task.id,
        auth: clientSecret,
        // @ts-ignore
        properties: {
          "Last Synced": {
            date: {
              start: moment().utc().add(1, "minute").toISOString(),
            },
          },
        },
      })
    }
  }

  if (clientTasksFiltered.length <= 0) {
    for (const task of RNTasksFiltered) {
      console.log("Syncing RN" + task)
      await notion.pages.update({
        page_id: task.id,
        auth: rationalSecret,
        // @ts-ignore
        properties: {
          "Last Synced": {
            date: {
              start: moment().utc().add(1, "minute").toISOString(),
            },
          },
        },
      })
    }
  }

*/
  // Filter and update last synced
  console.log("Finished")
}

// todo: add debugging

for (let i = 0; i < process.argv.length; i++) {
  switch (process.argv[i]) {
    case "start":
      main()
      break
  }
}

/*
function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
async function handle() {
  try {
    const members = await getMemberIds();
    for (const id of members) {
      await automateInvoice(id);
    }
  } catch (error) {
    console.error(error);
    // try again after 3 minutes
    await timeout(3 * 1000);
    await handle();
  }
}
*/
