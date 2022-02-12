import { Client as NotionClient } from "@notionhq/client"
import {
  clientDatabaseId,
  clientSecret,
  rationalDatabaseId,
  rationalSecret,
} from "./config"
import util from "util"

export function cleanChildBlocks(blocks) {
  return (
    blocks
      // .filter((b) => {
      //   return !(b.type === "embed" && !b.embed.url);
      // })
      .map((b) => {
        // delete b.id
        // @ts-ignore
        delete b.created_time
        // @ts-ignore
        delete b.last_edited_time
        // @ts-ignore
        // delete b.has_children;
        // @ts-ignore
        delete b.archived
        return b
      })
  )
}

export function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function log(arg) {
  console.log(util.inspect(arg, false, null, true))
}

export async function getBlockChildren(
  notion: NotionClient,
  secret: string,
  blockId: string,
  clean = false,
  recursive = false,
  excludeEmbed = false
) {
  const { results: blocks } = await notion.blocks.children.list({
    auth: secret,
    block_id: blockId,
  })

  const blocksWithChildren = await Promise.all(
    blocks
      .filter((b) => {
        // return !(b.type === "embed" && !b.embed.url);
        // todo: images aren't really supported if uploaded to notion
        if (
          // @ts-ignore
          b.type === "child_database" ||
          // @ts-ignore
          b.type === "template" ||
          // @ts-ignore
          (excludeEmbed ? b.type === "embed" : false)
        ) {
          return false
        }

        // @ts-ignore
        if (b.type === "image" && !b.image.file) {
          return false
        }

        return true
      })
      .map(async (b) => {
        // @ts-ignore
        if (b.image) {
          // @ts-ignore
          b.image.external = {
            // @ts-ignore
            url: b.image.file.url,
          }
          // @ts-ignore
          b.image.type = "external"

          // @ts-ignore
          delete b.image.file

          console.log(b)
        }

        // @ts-ignore
        if (b.toggle) {
          // @ts-ignore
          // delete b.has_children;
        }

        // @ts-ignore
        if (b.video) {
          // @ts-ignore
          b.type = "embed"
          // @ts-ignore
          b.embed = {
            // @ts-ignore
            // todo: need to convert to embed url
            // url: b.video.external.url,
            url: "https://www.loom.com/embed/ebf85a2bf4934263a1587153815cd44f",
          }

          // @ts-ignore
          delete b.video
        }

        // @ts-ignore
        if (b.has_children && recursive) {
          // recursive call?
          // @ts-ignore
          const childBlocks = await getBlockChildren(
            notion,
            secret,
            b.id,
            true,
            true
          )

          // @ts-ignore
          delete b.has_children

          // @ts-ignore
          b[b.type].children = clean
            ? cleanChildBlocks(childBlocks)
            : childBlocks
          return b
        } else {
          return b
        }
      })
  )

  return clean ? cleanChildBlocks(blocksWithChildren) : blocksWithChildren
}

export async function fetchClientTasksLinked(
  notion,
  tasks
): Promise<Array<{ id: string }>> {
  // Construct filters
  const filters = {
    or: [],
  }

  for (const task of tasks) {
    filters.or.push({
      property: "ID",
      title: {
        equals: task.properties["Client Task ID"].rich_text[0].plain_text,
      },
    })
  }

  const { results: clientTasks } = await notion.databases.query({
    auth: clientSecret,
    database_id: clientDatabaseId,
    filter: filters,
  })

  return clientTasks
}

export async function fetchRationalTasksLinked(
  notion,
  tasks
): Promise<Array<{ id: string }>> {
  // Construct filters
  const filters = {
    or: [],
  }

  for (const task of tasks) {
    filters.or.push({
      property: "Client Task ID",
      // @ts-ignore
      title: { equals: task.properties["ID"].formula.string },
    })
  }

  const { results: rationalTasks } = await notion.databases.query({
    auth: rationalSecret,
    database_id: rationalDatabaseId,
    filter: filters,
  })

  return rationalTasks
}

export async function updatePageProps(notion, secret, tasks, props) {
  if (tasks.length === 0) {
    return null
  }

  const responses = []
  for (const task of tasks) {
    const r = await notion.pages.update({
      page_id: task.id,
      auth: secret,
      properties: props,
    })

    responses.push(r)
  }

  // todo: handle errors

  return responses
}

/**
 * Returns the index of the last element in the array where predicate is true, and -1
 * otherwise.
 * @param array The source array to search in
 * @param predicate find calls predicate once for each element of the array, in descending
 * order, until it finds one where predicate returns true. If such an element is found,
 * findLastIndex immediately returns that element index. Otherwise, findLastIndex returns -1.
 */
export function findLastIndex<T>(
  array: Array<T>,
  predicate: (value: T, index: number, obj: T[]) => boolean
): number {
  let l = array.length
  while (l--) {
    if (predicate(array[l], l, array)) return l
  }
  return -1
}
