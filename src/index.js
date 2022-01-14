// TODO this will run UTC midnight at end of invoice fortnight cycle

const { Client } = require("@notionhq/client");
const moment = require("moment");

// Initializing a client
const notion = new Client({
  auth:
    process.env.NOTION_TOKEN ||
    "secret_Iq0Cevx1Mtwxn9ofGhVRTIIt0g4ie6Zhxn1MSMGL7JA",
});

const firstDayOfCycle = moment("2021-08-02");
const today = moment();
const daysLeft = today.diff(firstDayOfCycle, "days") % 14;
const fortnightStartDate = today.subtract(daysLeft, "days");
const fortnightEndDate = moment(fortnightStartDate).add(14, "days");

const invoicePeriodFilter =
  fortnightStartDate.format("MMM D - ") + fortnightEndDate.format("MMM D");

function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getMemberIds() {
  const invoices = await notion.databases.query({
    database_id: "d56a7b0466aa496ca84b1db1f4b1844b", // Invoices database
    filter: {
      property: "Invoice Period",
      formula: {
        text: {
          equals: invoicePeriodFilter,
        },
      },
    },
  });

  let members = [];
  for (const task of invoices.results) {
    members = members.concat(task.properties["Created By"].created_by);
  }
  members = members.map((m) => m.id);
  // Dedupe
  return members.filter((item, pos) => members.indexOf(item) === pos);
}

async function automateInvoice(user_id) {
  // Query invoices in this pay-cycle
  const invoices = await notion.databases.query({
    database_id: "d56a7b0466aa496ca84b1db1f4b1844b", // Invoices database
    filter: {
      and: [
        {
          property: "Invoice Period",
          formula: {
            text: {
              equals: invoicePeriodFilter,
            },
          },
        },
        {
          property: "Related to Tasks",
          relation: {
            is_empty: true,
          },
        },
        {
          property: "Created By",
          people: {
            contains: user_id,
          },
        },
      ],
    },
  });
  if (invoices.results.length <= 0) return;

  // Query tasks database
  const tasks = await notion.databases.query({
    database_id: "ed4361f28cab4cb38686d835a640ae42", // Tasks database
    filter: {
      and: [
        {
          property: "State",
          select: {
            equals: "Invoiced",
          },
        },
        {
          property: "Invoice Period",
          formula: {
            text: {
              equals: invoicePeriodFilter,
            },
          },
        },
        {
          property: "Members",
          people: {
            contains: user_id,
          },
        },
      ],
    },
  });

  // Loop through each invoice
  for (const invoice of invoices.results) {
    // console.log("Task update", invoice);
    // Now relate invoice to all tasks for this cycle
    const updateResponse = await notion.pages.update({
      page_id: invoice.id,
      properties: {
        "Related to Tasks": {
          relation: tasks.results.map((t) => {
            return {
              id: t.id,
            };
          }),
        },
      },
    });

    // Get child blocks on invoice page
    const response = await notion.blocks.children.list({
      block_id: invoice.id,
      page_size: 20,
    });

    const blocks = response.results;

    // Delete un-needed database
    // Relies on Invoice template to end with blocks:
    // - Database (Tasks filtered by last month and invoiced)
    // - Paragraph
    // - Database (The related to tasks filtered database)

    if (
      blocks[blocks.length - 1].type !== "unsupported" ||
      blocks[blocks.length - 2].type !== "paragraph" ||
      blocks[blocks.length - 3].type !== "unsupported"
    ) {
      // Not correct format
      return;
    }

    const databaseResponse = await notion.blocks.delete({
      block_id: blocks[blocks.length - 3].id,
    });

    const paragraphResponse = await notion.blocks.delete({
      block_id: blocks[blocks.length - 2].id,
    });
  }
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

(async () => {
  await handle();
  console.log("~~ Done ~~");
})();
