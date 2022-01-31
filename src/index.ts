import {
  fetchClientTasksLinked,
  fetchRationalTasksLinked,
  getBlockChildren,
  updatePageProps,
} from "./utils"
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

// Construct our notion API client instance
const notion = new NotionClient()

// https://www.notion.so/<workspace>/<database id>?v=...

// https://www.notion.so/<workspace>/<page id>#<block id>
// const calloutBlockId = "<The ID of the callout block we want to sync>";

// const today = moment()

// todo: within minute changes and sync doesn't work
// todo: solution: if they are same time, full update and set last sync to time + 1 minute or something else and we need another conditional to filter out!

let full_sync = false

function filterTasks(tasks) {
  // console.log("-- Filter tasks -- ")
  return tasks.filter((task) => {
    // console.log(util.inspect(task.properties, false, null, true))

    // @ts-ignore
    if (!task.properties["Last Synced"].date) {
      return true
    } else {
      // @ts-ignore
      const d1 = moment(task.properties["Last Synced"].date.start).utc()
      // @ts-ignore
      const d2 = moment(task.properties["Last Edit"].last_edited_time).utc()

      console.log(d2.diff(d1, "minutes"))
      if (d2.diff(d1, "minutes") == -1) {
        return false
      }

      // console.log(d2.diff(d1, "minutes"))
      // if (d2.diff(d1, "minutes") <= 1) {
      if (d2.isSame(d1)) {
        // Full sync this time
        full_sync = true
        return true
      }
    }

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

async function syncTasksWithRN(clientTasks) {
  if (clientTasks.length < 1) {
    return
  }

  // Fetch all tasks from the RN database
  const rationalTasks = await fetchRationalTasksLinked(notion, clientTasks)

  for (const task of clientTasks) {
    // Update task in RN

    // Need to match with RN Tasks
    const RNTask = rationalTasks.find((rTask) => {
      return (
        // @ts-ignore
        rTask.properties["Client Task ID"].rich_text[0].plain_text ===
        // @ts-ignore
        task.properties["ID"].formula.string
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

    // console.log(util.inspect(briefRNBlock, false, null, true))

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
      task.id,
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
  }
  // console.log(util.inspect(rationalTasks, false, null, true))

  // Last synced from client
  await updatePageProps(notion, clientSecret, clientTasks, {
    "Last Synced": {
      date: {
        start: full_sync
          ? moment().utc().add(1, "minute").toISOString()
          : moment().utc().toISOString(),
      },
    },
  })
}

async function syncTasksWithClient(RNTasks) {
  if (RNTasks.length < 1) {
    return
  }

  // Todo: can we re-use these?
  const clientTasks = await fetchClientTasksLinked(notion, RNTasks)

  // Todo: Can't send roll up field. Update progress field when they use 'Rollup' type. Create formula which references this rollup field.

  for (const task of clientTasks) {
    // Need to match with RN Tasks
    const RNTask = RNTasks.find((rTask) => {
      return (
        // @ts-ignore
        rTask.properties["Client Task ID"].rich_text[0].plain_text ===
        // @ts-ignore
        task.properties["ID"].formula.string
      )
    })

    const propertiesToUpdate = ["Due Date", "Progress"]

    // Update last synced as well
    const propertySchemas = {
      "Last Synced": {
        date: {
          start: moment().utc().toISOString(),
        },
      },
    }

    propertiesToUpdate.forEach((prop) => {
      propertySchemas[prop] = {
        ...RNTask.properties[prop],
      }
    })

    await notion.pages.update({
      page_id: task.id,
      auth: clientSecret,
      // @ts-ignore
      properties: propertySchemas,
    })

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

    if (deliverableRNBlock) {
      // Send deliverable back to client
      const blocksClient = await getBlockChildren(
        notion,
        clientSecret,
        task.id,
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
          block_id: task.id,
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
  }

  await updatePageProps(notion, rationalSecret, RNTasks, {
    "Last Synced": {
      date: {
        start: full_sync
          ? moment().utc().add(1, "minute").toISOString()
          : moment().utc().toISOString(),
      },
    },
  })
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

export async function main() {
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

  // Client tasks that have been updated
  const clientTasksFiltered = filterTasks(clientTasks)
  // RN tasks that have been updated
  const RNTasksFiltered = filterTasks(rationalTasks)

  console.log(util.inspect(clientTasksFiltered, false, null, true))
  console.log(util.inspect(RNTasksFiltered, false, null, true))

  // Client -> RN sync
  await syncTasksWithRN(clientTasksFiltered)

  // todo Last edit and last sync will not work as we update the RN task.
  // todo What if we give leeway of 1-2 minutes?

  // RN -> Client sync
  await syncTasksWithClient(RNTasksFiltered)
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
