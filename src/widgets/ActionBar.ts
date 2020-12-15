import { DomWidget, container, Widget } from "../core/shared"
import { ButtonWidget } from "./ui"

export type ActionBarConfig = [string, () => void][]

export function ActionBarWidget(config: ActionBarConfig): Widget {
  function makeButton(name: string, handler: () => void): Widget {
    if (name == "Edit") return ButtonWidget("Edit", handler, "outline")
    if (name == "Delete")
      return ButtonWidget("Delete", handler, "outline-danger")
    if (name == "Save") return ButtonWidget("Save", handler, "outline")
    if (name == "Cancel")
      return ButtonWidget("Cancel", handler, "outline-secondary")
    if (name == "Create") return ButtonWidget("Create", handler, "outline")
    if (name == "Close") return ButtonWidget("Close", handler, "outline")
    throw new Error("button not supported")
  }
  return DomWidget(
    container('<div class="d-flex justify-content-end"></div>')(
      config.map(([name, handler]) =>
        makeButton(name, handler).dom.addClass("ml-2")
      )
    )
  )
}
