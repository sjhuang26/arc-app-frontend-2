import {
  container,
  Widget,
  DomWidget,
  ObservableState,
  getResourceByName
} from "../core/shared"
import { AskStatus } from "../core/server"

/*

THIS IS LITERALLY JUST A BIG UTILITIES FILE FOR WIDGETS.

*/

/*export function LoaderWidget() {
    const spinner = container('<div></div>')(
        $('<strong>Loading...</strong>'),
        $('<div class="spinner-border"></div>')
    );
    const dom = container('<div></div>')(spinner);
    const onLoaded = (child: JQuery) => {
        dom.empty();
        dom.append(child);
    };
    const onError = (message: string) => {
        const errorMessageDom = container(
            '<div class="alert alert-danger"></div>'
        )(container('<h1></h1>')('Error'), container('<span></span>')(message));
        dom.empty();
        dom.append(errorMessageDom);
    };

    return {
        dom,
        onLoaded,
        onError
    };
}*/

export function ListGroupNavigationWidget<T>(
  data: T[],
  dataToContent: (item: T) => JQuery,
  emptyUiMessage: string,
  onRenavigation: (item: T, index: number) => void
): Widget {
  function renavigate(item: T, index: number) {
    dom.children().removeClass("active")
    dom
      .children()
      .eq(index)
      .addClass("active")
    onRenavigation(item, index)
  }

  const dom = container('<ul class="list-group">')(
    data.length === 0
      ? container('<li class="list-group-item">')("No items")
      : data.map((item, index) =>
          container('<li class="list-group-item">')(dataToContent(item)).click(
            () => renavigate(item, index)
          )
        )
  )
  return DomWidget(dom)
}

export function addPopoverToDom(dom: JQuery, popoverDom: JQuery): void {
  dom.popover({
    content: container("<span>")(...popoverDom.toArray())[0]
  })
}

export function ErrorWidget(message: string): Widget {
  const dom = container('<div class="alert alert-danger"></div>')(
    container("<h1></h1>")("Error"),
    $(
      "<p><strong>An error occurred. You can try closing the window and opening again.</strong></p>"
    ),
    container("<span></span>")(message)
  )
  return DomWidget(dom)
}

export function ButtonWidget(
  content: string | JQuery,
  onClick: () => void,
  variant: string = "primary"
): Widget {
  // to create an outline button, add "outline" to the variant
  if (variant === "outline") variant = "outline-primary"
  if (typeof content === "string") {
    return DomWidget(
      $("<button></button>")
        .text(content)
        .addClass("btn btn-" + variant)
        .click(e => {
          e.preventDefault()
          onClick()
        })
    )
  } else {
    return DomWidget(
      $("<button></button>")
        .append(content)
        .addClass("btn btn-" + variant)
        .click(e => {
          e.preventDefault()
          onClick()
        })
    )
  }
}

const modalHtmlString = `<div class="modal" tabindex="-1" role="dialog">
<div class="modal-dialog modal-lg" role="document">
  <div class="modal-content">
    <div class="modal-header">
      <h5 class="modal-title"></h5>
      <button type="button" class="close" data-dismiss="modal" aria-label="Close">
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
    <div class="modal-body">
    </div>
    <div class="modal-footer">
    </div>
  </div>
</div>
</div>`

export function showModal(
  title: string,
  content: string | JQuery,
  buildButtons: (buildButton: {
    (
      text: string,
      style: string,
      onClick?: () => void,
      preventAutoClose?: boolean
    ): JQuery
    close: () => void
  }) => JQuery[],
  preventBackgroundClose?: boolean
): Promise<void> & { closeModal: () => void } {
  const dom = $(modalHtmlString)
  dom.find(".modal-title").text(title)
  dom
    .find(".modal-body")
    .append(
      typeof content === "string" ? container("<p></p>")(content) : content
    )

  const closeModal = () => {
    dom.modal("hide")
    dom.modal("dispose")
    dom.remove()
    // https://stackoverflow.com/questions/28077066/bootstrap-modal-issue-scrolling-gets-disabled
    if ($(".modal.show").length > 0) {
      $("body").addClass("modal-open")
    }
  }

  const buildButtonsParameterFunction = (
    text: string,
    style: string,
    onClick?: () => void,
    preventAutoClose?: boolean
  ) =>
    $('<button type="button" class="btn">')
      .addClass("btn-" + style)
      .click(() => {
        if (onClick) {
          onClick()
        }
        if (!preventAutoClose) {
          closeModal()
        }
      })
      .text(text)

  buildButtonsParameterFunction.close = closeModal
  dom.find(".modal-footer").append(buildButtons(buildButtonsParameterFunction))
  const settings: any = {}
  // https://stackoverflow.com/questions/22207377/disable-click-outside-of-bootstrap-modal-area-to-close-modal
  if (preventBackgroundClose) {
    settings.backdrop = "static"
    settings.keyboard = false
  }
  dom.modal(settings)
  const modifiedPromise: any = new Promise<void>(res => {
    dom.on("hidden.bs.modal", () => {
      dom.modal("dispose")
      dom.remove()
      if ($(".modal.show").length > 0) {
        $("body").addClass("modal-open")
      }
      res()
    })
  })
  modifiedPromise.closeModal = closeModal
  return modifiedPromise
}

export type FormValueWidget<T> = Widget & {
  getValue(): any
  setValue(newVal: T): JQuery
  onChange(doThis: (newVal: T) => void, useInputEvent?: boolean): void
}

export function FormStringInputWidget(type: string): FormValueWidget<string> {
  const dom = $(`<input class="form-control" type="${type}">`)
  return {
    dom,
    getValue(): string {
      return String(dom.val())
    },
    setValue(newVal: string): JQuery {
      return dom.val(newVal)
    },
    onChange(doThis: (newVal: string) => void, useInputEvent?: boolean): void {
      if (useInputEvent) {
        dom.on("input", () => doThis.call(null, dom.val() as string))
      } else {
        dom.change(() => doThis.call(null, dom.val() as string))
      }
    }
  }
}

export function FormTextareaWidget(): FormValueWidget<string> {
  const dom = $(`<textarea class="form-control">`)
  return {
    dom,
    getValue(): string {
      return String(dom.val())
    },
    setValue(newVal: string): JQuery {
      return dom.val(newVal)
    },
    onChange(doThis: (newVal: string) => void): void {
      dom.change(() => {
        doThis.call(null, dom.val() as string)
      })
    }
  }
}

export function FormJsonInputWidget(defaultValue: any): FormValueWidget<any> {
  const dom = $(`<input class="form-control" type="text">`)
  dom.val(JSON.stringify(defaultValue))
  return {
    dom,
    getValue(): any {
      return JSON.parse(dom.val() as string)
    },
    setValue(newVal: any): JQuery {
      return dom.val(JSON.stringify(newVal))
    },
    onChange(doThis: (newVal: any) => void): void {
      dom.change(() => doThis.call(null, JSON.parse(dom.val() as string)))
    }
  }
}

export function FormNumberInputWidget(type: string): FormValueWidget<number> {
  let dom: JQuery = null
  if (type === "number") {
    dom = $(`<input class="form-control" type="number">`)
  }
  if (type === "datetime-local") {
    dom = $(`<input class="form-control" type="datetime-local">`)
  }
  function getVal(): number {
    if (type == "datetime-local") {
      // a hack to get around Typescript types
      const htmlEl: any = dom.get(0)
      const date = htmlEl.valueAsNumber as number
      return date ? date : 0
    }
    return Number(dom.val())
  }
  return {
    dom,
    getValue(): number {
      return getVal()
    },
    setValue(val: number): JQuery {
      if (type == "datetime-local") {
        // a hack to get around Typescript types
        const htmlEl: any = dom.get(0)
        htmlEl.valueAsNumber = val
        return dom
      }
      return dom.val(val)
    },
    onChange(doThis) {
      dom.change(doThis.call(null, getVal()))
    }
  }
}

export function FormBooleanInputWidget(): FormValueWidget<boolean> {
  const input = $(`<input type="checkbox">`)
  const dom = container('<div class="form-check">')(input)
  return {
    dom,
    getValue(): boolean {
      return input.prop("checked")
    },
    setValue(val: boolean): JQuery {
      input.prop("checked", Boolean(val))
      return dom
    },
    onChange(doThis) {
      dom.change(doThis.call(null, input.prop("checked")))
    }
  }
}
export function FormIdInputWidget(
  resource: string | undefined,
  isOptional: boolean
): FormValueWidget<number> {
  const input = $(`<input class="form-control" type="number">`)
  const dom = container("<div>")(
    input,
    resource === undefined
      ? undefined
      : ButtonWidget("Change", () => {
          const { closeModal } = showModal(
            "Edit ID",
            getResourceByName(resource).makeSearchWidget("Pick", id => {
              input.val(id)
              closeModal()
            }).dom,
            bb =>
              isOptional
                ? [
                    bb("Set to blank ID (-1)", "secondary", () =>
                      input.val(-1)
                    ),
                    bb("Close", "primary")
                  ]
                : [bb("Close", "primary")]
          )
        }).dom,
    resource === undefined
      ? undefined
      : ButtonWidget("View", () => {
          if (getVal() !== -1) {
            getResourceByName(resource).makeTiledEditWindow(getVal())
          }
        }).dom
  )
  function getVal(): number {
    return Number(input.val())
  }
  return {
    dom,
    getValue(): number {
      return getVal()
    },
    setValue(val: number): JQuery {
      return input.val(val)
    },
    onChange(doThis) {
      input.change(doThis.call(null, getVal()))
    }
  }
}

export function FormNumberArrayInputWidget(
  type: string
): FormValueWidget<number[]> {
  let dom: JQuery = null
  if (type === "number") {
    // arrays are entered as comma-separated values
    dom = $(`<input class="form-control" type="text">`)
  } else {
    throw new Error("unsupported type")
  }
  function getVal(): number[] {
    return String(dom.val())
      .split(",")
      .map(x => x.trim())
      .filter(x => x !== "")
      .map(x => Number(x))
  }
  return {
    dom,
    getValue(): number[] {
      return getVal()
    },
    setValue(val: number[]): JQuery {
      return dom.val(val.map(x => String(x)).join(", "))
    },
    onChange(doThis) {
      dom.change(doThis.call(null, getVal()))
    }
  }
}

export function StringField(type: string, optional?: string): FormFieldType {
  // () => FormStringInputWidget(type),
  return {
    makeWidget: () => FormStringInputWidget(type),
    validator(val: any) {
      if (typeof val !== "string") {
        return "field should be text/string, but isn't"
      }
      if (!(optional === "optional")) {
        if (val === "") {
          return "field shouldn't be blank"
        }
        if (val.trim() === "") {
          return "field shouldn't be blank (there is only whitespace)"
        }
      }
      return true
    }
  }
}
export function NumberField(type: string, optional?: string): FormFieldType {
  return {
    makeWidget: () => FormNumberInputWidget(type),
    validator(val: any) {
      if (type === "number" || type === "datetime-local") {
        if (typeof val !== "number") {
          return "field isn't a number"
        }
        // TODO support optionals, which will require null support for numbers
        return true
      }
      return true
    }
  }
}
export function BooleanField(): FormFieldType {
  return {
    makeWidget: () => FormBooleanInputWidget(),
    validator(val: any) {
      if (typeof val !== "boolean") return "not a true/false value"
      return true
    }
  }
}
export function IdField(resource?: string, optional?: string): FormFieldType {
  return {
    makeWidget: () => FormIdInputWidget(resource, optional === "optional"),
    validator(val: any) {
      if (typeof val !== "number") return "ID isn't a number"
      if (resource === undefined || (optional === "optional" && val === -1))
        return true
      return {
        resource,
        id: val
      }
    },
    isIdField: true
  }
}
export function SelectField(
  options: string[],
  optionTitles: string[]
): FormFieldType {
  return {
    makeWidget: () => FormSelectWidget(options, optionTitles),
    validator(val: any) {
      // TODO: proper select field validation
      if (typeof val !== "string") {
        return "field isn't text/string"
      }
      // select fields are never optional
      if (val === "") {
        return "field is blank"
      }
      if (val.trim() === "") {
        return "field is blank (only whitespace)"
      }
      return true
    }
  }
}
export function NumberArrayField(type: string): FormFieldType {
  return {
    makeWidget: () => FormNumberArrayInputWidget(type),
    validator(val: any) {
      // TODO: proper number array field validation
      return true
    }
  }
}
export function JsonField(defaultValue: any): FormFieldType {
  return {
    makeWidget: () => FormJsonInputWidget(defaultValue),
    validator(val: any) {
      // TODO: proper JSON field validation
      return true
    }
  }
}

export type FieldValidatorResult = true | string | FieldValidatorIdResult
export type FieldValidatorIdResult = {
  resource: string
  id: number
}
export type FormFieldType = {
  makeWidget: () => FormValueWidget<any>
  validator: (val: any) => FieldValidatorResult
  isIdField?: boolean
}

export function FormSelectWidget(
  options: string[],
  optionTitles: string[]
): FormValueWidget<string> {
  const dom = container('<select class="form-control"></select>')(
    options.map((_o, i) =>
      container("<option></option>")(optionTitles[i]).val(options[i])
    )
  )
  const k = {
    dom,
    getValue(): string {
      return dom.val() as string
    },
    setValue(val: string): JQuery {
      return dom.val(val)
    },
    onChange(doThis: (newVal: string) => void, useInputEvent?: boolean): void {
      if (useInputEvent) {
        dom.on("input", () => doThis.call(null, dom.val() as string))
      } else {
        dom.change(() => doThis.call(null, dom.val() as string))
      }
    }
  }
  return k
}
export function FormToggleWidget(
  titleWhenFalse: string,
  titleWhenTrue: string,
  styleWhenFalse: string = "outline-secondary",
  styleWhenTrue: string = "primary"
): FormValueWidget<boolean> {
  function setVal(newVal: boolean): JQuery {
    if (val === newVal) return
    if (newVal) {
      val = true
      dom.text(titleWhenTrue)
      dom.removeClass("btn-" + styleWhenFalse)
      dom.addClass("btn-" + styleWhenTrue)
      return dom
    } else {
      val = false
      dom.text(titleWhenFalse)
      dom.removeClass("btn-" + styleWhenTrue)
      dom.addClass("btn-" + styleWhenFalse)
      return dom
    }
  }
  const dom = $('<button class="btn"></button>').click(() => {
    if (val === null) {
      throw new Error("improper init of toggle button")
    }
    setVal(!val)
  })
  let val = null

  const k = {
    dom,
    getValue(): boolean {
      if (val === null)
        throw new Error("attempt to read toggle button value before init")
      return val
    },
    setValue(val: boolean): JQuery {
      setVal(val)
      return dom
    },
    onChange(doThis: (newVal: boolean) => void): void {
      dom.click(() => doThis.call(null, val))
    }
  }
  return k
}

export function createMarkerLink(text: string, onClick: () => void): JQuery {
  return $('<a style="cursor: pointer; text-decoration: underline"></a>')
    .text(text)
    .click(onClick)
}

export function MessageTemplateWidget(content: string): Widget {
  const textarea = $('<textarea class="form-control"></textarea>')
  textarea.val(content)

  const button = ButtonWidget("Copy to clipboard", () => {
    const htmlEl: any = textarea[0]
    htmlEl.select()
    document.execCommand("copy")
    button.val("Copied!")
    setTimeout(() => button.val("Copy to clipboard"), 1000)
  })
  return DomWidget(
    container('<div class="card"></div>')(
      container('<div class="card-body"></div>')(textarea, button)
    )
  )
}
