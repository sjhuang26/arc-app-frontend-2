import { RecCollection, Rec, container } from "../core/shared"

export function TableWidget<T>(
  headerTitles: string[],
  makeRowContent: (item: T) => (JQuery | string)[]
) {
  let values: T[] = []
  const dom = $('<table class="table"></table>')
  function setAllValues(collection: { [key: string]: T } | T[]) {
    if (typeof collection === "object") {
      values = Object.values(collection)
    } else {
      values = collection
    }
    rebuildTable()
  }
  function rebuildTable() {
    dom.empty()
    // headers
    dom.append(
      container("<thead></thead>")(
        container("<tr></tr>")(
          headerTitles.map(str => container('<th scope="col"></th>')(str))
        )
      )
    )
    // content
    dom.append(
      container("<tbody></tbody>")(
        values.map(record =>
          container("<tr></tr>")(
            makeRowContent(record).map((rowContent, i) =>
              container("<td></td>")(
                typeof rowContent === "string"
                  ? document.createTextNode(rowContent)
                  : rowContent
              )
            )
          )
        )
      )
    )
  }
  rebuildTable()
  return {
    dom,
    setAllValues
  }
}
