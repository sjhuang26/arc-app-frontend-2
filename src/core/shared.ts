import { askServer, AskStatus, AskFinished, getResultOrFail } from "./server"
import { FormWidget } from "../widgets/Form"

import {
  StringField,
  NumberField,
  SelectField,
  FormFieldType,
  ErrorWidget,
  ButtonWidget,
  NumberArrayField,
  createMarkerLink,
  JsonField,
  showModal,
  IdField,
  FormStringInputWidget,
  FormSelectWidget,
  BooleanField
} from "../widgets/ui"
import { TableWidget } from "../widgets/Table"

export function MyTesting() {
  return 4
}

/*

ALL BASIC CLASSES AND BASIC UTILS

*/

/*

Shared with the other file

*/

export type Rec = {
  id: number
  date: number
  [others: string]: any
}
export type RecCollection = {
  [id: string]: Rec
}

export enum ModStatus {
  UNFREE,
  FREE,
  DROP_IN,
  BOOKED,
  MATCHED,
  FREE_PREF,
  DROP_IN_PREF
}

export enum SchedulingReference {
  BOOKING,
  MATCHING
}

export function schedulingTutorIndex(
  tutorRecords: RecCollection,
  bookingRecords: RecCollection,
  matchingRecords: RecCollection
) {
  const tutorIndex: {
    [id: number]: {
      id: number
      modStatus: ModStatus[]
      refs: [SchedulingReference, number][]
    }
  } = {}
  for (const tutor of Object.values(tutorRecords)) {
    tutorIndex[tutor.id] = {
      id: tutor.id,
      modStatus: Array(20).fill(ModStatus.UNFREE),
      refs: []
    }
    const tms = tutorIndex[tutor.id].modStatus
    for (const mod of tutor.mods) {
      tms[mod - 1] = ModStatus.FREE
    }
    for (const mod of tutor.dropInMods) {
      tms[mod - 1] = ModStatus.DROP_IN
    }
    for (const mod of tutor.modsPref) {
      switch (tms[mod - 1]) {
        case ModStatus.FREE:
        case ModStatus.UNFREE:
          tms[mod - 1] = ModStatus.FREE_PREF
          break
        case ModStatus.DROP_IN:
          tms[mod - 1] = ModStatus.DROP_IN_PREF
          break
        default:
          throw new Error()
      }
    }
  }
  for (const booking of Object.values(bookingRecords)) {
    if (booking.status !== "ignore" && booking.status !== "rejected") {
      if (booking.mod !== undefined)
        tutorIndex[booking.tutor].modStatus[booking.mod - 1] = ModStatus.BOOKED
      tutorIndex[booking.tutor].refs.push([
        SchedulingReference.BOOKING,
        booking.id
      ])
    }
  }
  for (const matching of Object.values(matchingRecords)) {
    if (matching.mod !== undefined) {
      tutorIndex[matching.tutor].modStatus[matching.mod - 1] = ModStatus.MATCHED
      tutorIndex[matching.tutor].refs.push([
        SchedulingReference.MATCHING,
        matching.id
      ])
    }
  }
  return tutorIndex
}

/*

/END

*/

export function arrayEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false
  }
  return true
}
export async function alertError(err: any): Promise<void> {
  await showModal(
    "Error!",
    container("<div>")(
      $("<p><b>There was an error.</b></p>"),
      container("<p>")(stringifyError(err))
    ),
    bb => [bb("OK", "primary")]
  )
}

// This function converts mod numbers (ie. 11) into A-B-day strings (ie. 1B).
// The function is not used often because we expect users of the app to be able to
// work with the 1-20 mod notation.
export function stringifyMod(mod: number) {
  if (1 <= mod && mod <= 10) {
    return String(mod) + "A"
  } else if (11 <= mod && mod <= 20) {
    return String(mod - 10) + "B"
  }
  throw new Error(`mod ${mod} isn't serializable`)
}

export function stringifyError(error: any): string {
  console.error(error)
  if (error instanceof Error) {
    return JSON.stringify(error, Object.getOwnPropertyNames(error))
  }
  try {
    return JSON.stringify(error)
  } catch (unusedError) {
    return String(error)
  }
}

export class Event {
  listeners: (() => any)[]

  constructor() {
    this.listeners = []
  }
  trigger() {
    for (const listener of this.listeners) {
      listener()
    }
  }
  get chain() {
    return this.trigger.bind(this)
  }
  listen(cb: () => any) {
    this.listeners.push(cb)
  }
}

export function container(newTag: string) {
  return (...children: any) => {
    if (Array.isArray(children[0])) {
      return $(newTag).append(
        children[0].map((x: any) =>
          typeof x === "string" ? $(document.createTextNode(x)) : x
        )
      )
    }
    return $(newTag).append(
      children.map((x: any) =>
        typeof x === "string" ? $(document.createTextNode(x)) : x
      )
    )
  }
}

export type Widget = {
  dom: JQuery
  [others: string]: any
}
export function DomWidget(dom: JQuery) {
  return { dom }
}

export class ObservableState<T> {
  val: T
  change: Event
  constructor(initialValue: T) {
    this.val = initialValue
    this.change = new Event()

    // TODO: make sure this works
    this.change.trigger()
  }
  changeTo(val: T) {
    this.val = val
    this.change.trigger()
  }
}

export function generateStringOfMods(
  mods: number[],
  modsPref: number[]
): string {
  return mods
    .map(mod => String(mod) + (modsPref.includes(mod) ? "*" : ""))
    .join(", ")
}

/*

RESOURCES

*/

export class ResourceEndpoint {
  name: string
  constructor(name: string) {
    this.name = name
  }
  async askEndpoint(...partialArgs: any[]): Promise<AskFinished<any>> {
    return askServer([this.name].concat(partialArgs))
  }

  // NOTE: ALL THESE RETURN PROMISES

  retrieveAll(): Promise<AskFinished<RecCollection>> {
    return this.askEndpoint("retrieveAll")
  }
  create(record: Rec): Promise<AskFinished<Rec>> {
    return this.askEndpoint("create", record)
  }
  delete(id: number): Promise<AskFinished<void>> {
    return this.askEndpoint("delete", id)
  }
  debug(): Promise<AskFinished<any>> {
    return this.askEndpoint("debug")
  }
  update(record: Rec): Promise<AskFinished<void>> {
    return this.askEndpoint("update", record)
  }
}
export class ResourceObservable extends ObservableState<
  AskFinished<RecCollection>
> {
  endpoint: ResourceEndpoint

  constructor(endpoint: ResourceEndpoint) {
    super({
      status: AskStatus.ERROR,
      message: "resource was not initialized properly"
    })
    this.endpoint = endpoint
  }

  getRecordOrFail(id: number) {
    const val = this.getLoadedOrFail()
    if (val[String(id)] === undefined) {
      throw new Error("record not available: " + this.endpoint.name + "/#" + id)
    }
    return val[String(id)]
  }

  findRecordOrFail(id: number) {
    const val = this.getLoadedOrFail()
    if (val[String(id)] === undefined) {
      return null
    }
    return val[String(id)]
  }

  getLoadedOrFail(): RecCollection {
    if (this.val.status != AskStatus.LOADED) {
      throw new Error("resource is not loaded: " + this.endpoint.name)
    }
    return this.val.val
  }

  getRecordCollectionOrFail(): RecCollection {
    if (this.val.status == AskStatus.ERROR) {
      throw this.val.message
    } else {
      return this.val.val
    }
  }
  async dependOnRecordOrFail(id: number): Promise<Rec> {
    await this.getRecordCollectionOrFail()
    return this.getRecordOrFail(id)
  }

  async updateRecord(record: Rec): Promise<AskFinished<void>> {
    if (this.val.status === AskStatus.ERROR) return this.val
    this.val.val[String(record.id)] = record
    this.change.trigger()
    return await this.endpoint.update(record)
  }

  async createRecord(record: Rec): Promise<AskFinished<Rec>> {
    if (this.val.status === AskStatus.ERROR) return this.val
    const ask = await this.endpoint.create(record)
    if (ask.status !== AskStatus.ERROR) {
      this.val.val[String(ask.val.id)] = ask.val
      this.change.trigger()
    }
    return ask
  }

  async deleteRecord(id: number): Promise<AskFinished<void>> {
    if (this.val.status === AskStatus.ERROR) return this.val
    delete this.val.val[String(id)]
    this.change.trigger()
    return await this.endpoint.delete(id)
  }

  onServerNotificationUpdate(record: Rec) {
    if (this.val.status === AskStatus.LOADED) {
      this.val.val[String(record.id)] = record
      this.change.trigger()
    }
  }

  onServerNotificationCreate(record: Rec) {
    if (this.val.status === AskStatus.LOADED) {
      this.val.val[String(record.id)] = record
      this.change.trigger()
    }
  }

  onServerNotificationDelete(id: number) {
    if (this.val.status === AskStatus.LOADED) {
      delete this.val.val[String(id)]
      this.change.trigger()
    }
  }
}

export class Resource {
  name: string
  endpoint: ResourceEndpoint
  state: ResourceObservable
  info: ResourceInfo

  constructor(name: string, info: ResourceInfo) {
    this.name = name
    this.endpoint = new ResourceEndpoint(this.name)
    this.state = new ResourceObservable(this.endpoint)
    this.info = info
  }

  makeFormWidget() {
    return FormWidget(this.info.fields)
  }

  createFriendlyMarker(
    id: number,
    builder: (record: Rec) => string,
    onClick?: () => void
  ): JQuery {
    // TODO
    return this.createDataEditorMarker(id, builder, onClick)
  }

  createDataEditorMarker(
    id: number,
    builder: (record: Rec) => string,
    onClick: () => void = () => this.makeTiledEditWindow(id)
  ): JQuery {
    return createMarkerLink(this.createLabel(id, builder), onClick)
  }

  createLabel(id: number, builder: (record: Rec) => string): string {
    try {
      if (id === -1) return "[NONE]"
      const record = this.state.getRecordOrFail(id)
      return builder.call(null, record)
    } catch (e) {
      console.error(e)
      return `(??? UNKNOWN #${String(id)} ???)`
    }
  }

  createDomLabel(id: number, builder: (record: Rec) => JQuery): JQuery {
    try {
      if (id === -1) return $("<span>[NONE]</span>")
      const record = this.state.getRecordOrFail(id)
      return builder.call(null, record)
    } catch (e) {
      console.error(e)
      return $(`<span>(??? UNKNOWN #${String(id)} ???)</span>`)
    }
  }

  // The edit window is kind of combined with the view window.
  makeTiledEditWindow(id: number): void {
    let record: Rec = null
    let errorMessage: string = ""
    try {
      function capitalizeWord(w: string) {
        return w.charAt(0).toUpperCase() + w.slice(1)
      }

      this.state.getRecordCollectionOrFail()
      record = this.state.getRecordOrFail(id)
      const windowLabel =
        capitalizeWord(this.info.title) +
        ": " +
        this.createLabel(id, this.info.makeLabel)

      const form = this.makeFormWidget()
      form.setAllValues(record)

      showModal(
        windowLabel,
        container("<div></div>")(container("<h1></h1>")(windowLabel), form.dom),
        bb => [
          bb(
            "Delete",
            "danger",
            () => this.makeTiledDeleteWindow(id, () => bb.close()),
            false
          ),
          bb("Save", "primary", async () => {
            const ask = await this.state.updateRecord(form.getAllValues())
            if (ask.status === AskStatus.ERROR) {
              alertError(ask.message)
            }
          }),
          bb("Close", "secondary")
        ]
      )
    } catch (err) {
      const windowLabel = "ERROR in: " + this.info.title + " #" + id
      errorMessage = stringifyError(err)
      showModal(windowLabel, ErrorWidget(errorMessage).dom, bb => [
        bb("Close", "primary")
      ])
    }
  }

  makeTiledCreateWindow(): void {
    let errorMessage: string = ""
    try {
      this.state.getRecordCollectionOrFail()
      const windowLabel = "Create new " + this.info.title

      const form = this.makeFormWidget()
      form.setAllValues({ id: -1, date: Date.now() })

      showModal(
        windowLabel,
        container("<div></div>")(container("<h1></h1>")(windowLabel), form.dom),
        bb => [
          bb("Create", "primary", async () => {
            try {
              getResultOrFail(
                await this.state.createRecord(form.getAllValues())
              )
            } catch (err) {
              alertError(err)
            }
          }),
          bb("Cancel", "secondary")
        ]
      )
    } catch (err) {
      const windowLabel = "ERROR in: create new " + this.info.title
      errorMessage = stringifyError(err)
      showModal(windowLabel, ErrorWidget(errorMessage).dom, bb => [
        bb("Close", "primary")
      ])
    }
  }

  makeSearchWidget(actionText: string, action: (id: number) => void): Widget {
    const info = this.info
    function doSearch(): void {
      if (searchWidget.getValue().trim() === "") {
        table.setAllValues(Object.keys(recordCollection).map(x => Number(x)))
        return
      }
      const options = {
        id: ["id"],
        shouldSort: true,
        threshold: 0.6,
        location: 0,
        distance: 100,
        maxPatternLength: 32,
        minMatchCharLength: 1,
        keys: ["searchableContent"]
      }

      const fuse = new window["Fuse"](
        Object.values(recordCollection).map(record => ({
          id: record.id,
          searchableContent: info.makeSearchableContent(record).join(" ")
        })),
        options
      )
      const results = fuse.search(searchWidget.getValue())
      console.log(results)
      table.setAllValues(results.map((x: string) => Number(x)))
    }
    const recordCollection = this.state.getRecordCollectionOrFail()

    const table = TableWidget(
      this.info.tableFieldTitles.concat(actionText),
      (id: number) =>
        this.info
          .makeTableRowContent(recordCollection[id])
          .concat(ButtonWidget(actionText, () => action(id)).dom)
    )

    const searchWidget = FormStringInputWidget("string")
    searchWidget.onChange(() => doSearch(), true)

    doSearch()

    return DomWidget(
      container("<div>")(
        searchWidget.dom.attr("placeholder", "Search..."),
        table.dom
      )
    )
  }

  makeTiledViewAllWindow(): void {
    let errorMessage: string = ""
    try {
      const windowLabel = "View all " + this.info.pluralTitle

      showModal(
        windowLabel,
        container("<div></div>")(
          container("<h1></h1>")(windowLabel),
          this.makeSearchWidget("Edit", (id: number) =>
            this.makeTiledEditWindow(id)
          ).dom
        ),
        bb => [
          bb("Create", "secondary", () => this.makeTiledCreateWindow(), true),
          bb("Close", "primary")
        ]
      )
    } catch (err) {
      errorMessage = stringifyError(err)
      const windowLabel = "ERROR in: view all " + this.info.pluralTitle
      showModal(windowLabel, ErrorWidget(errorMessage).dom, bb => [
        bb("Close", "primary")
      ])
    }
  }

  makeTiledDeleteWindow(id: number, closeParentWindow: () => void): void {
    const windowLabel =
      "Delete this " +
      this.info.title +
      "? (" +
      this.createLabel(id, record => record.friendlyFullName) +
      ")"
    showModal(
      windowLabel,
      container("<div></div>")(
        container("<h1></h1>")("Delete?"),
        container("<p></p>")("Are you sure you want to delete this?")
      ),
      bb => [
        bb("Delete", "danger", () =>
          this.state
            .deleteRecord(id)
            .then(() => closeParentWindow())
            .catch(err => alertError(err))
        ),
        bb("Cancel", "primary")
      ]
    )
  }
}

/*

IMPORTANT GLOBALS

*/

export const state = {
  tiledWindows: new ObservableState<
    {
      key: number
      window: Widget
      visible: boolean
      title: string
      onLoad: Event
    }[]
  >([])
}

/*

WINDOW-RELATED GLOBAL METHODS

*/

export function addWindow(
  window: Widget,
  windowKey: number,
  title: string,
  onLoad: Event
) {
  // The onLoad event is triggered BEFORE the window is added. If the first onLoad call fails, no window will be created.
  onLoad.trigger()

  state.tiledWindows.val.push({
    key: windowKey,
    window,
    visible: true,
    title,
    onLoad
  })
  for (const window of state.tiledWindows.val) {
    if (window.key === windowKey) {
      window.visible = true
    } else {
      // you can't have two visible windows at once
      // so, hide all other windows
      window.visible = false
    }
  }
  state.tiledWindows.change.trigger()
}

export function removeWindow(windowKey: number) {
  // MEMORY LEAK PREVENTION: explicitly null out the onLoad event when the whole window is deleted
  for (const window of state.tiledWindows.val) {
    if (window.key === windowKey) {
      window.onLoad = null
    }
  }

  state.tiledWindows.val = state.tiledWindows.val.filter(
    ({ key }) => key !== windowKey
  )
  state.tiledWindows.change.trigger()
}

export function hideWindow(windowKey: number) {
  for (const window of state.tiledWindows.val) {
    if (window.key === windowKey) {
      window.visible = false
    }
  }
  state.tiledWindows.change.trigger()
}

export function showWindow(windowKey: number) {
  for (const window of state.tiledWindows.val) {
    if (window.key === windowKey) {
      window.visible = true
    } else {
      // you can't have two visible windows at once
      // so, hide all other windows
      window.visible = false
    }
  }
  state.tiledWindows.change.trigger()

  // trigger the onload event
  // TODO: removed the event for now, and might add back in later
  /*for (const window of state.tiledWindows.val) {
        if (window.key === windowKey) {
            window.onLoad.trigger();
        }
    }*/
}

/*

RESOURCE INFO

*/

export type ResourceFieldInfo = {
  title: string
  name: string
  type: FormFieldType
  info?: string
}

export type ResourceInfo = {
  fields: ResourceFieldInfo[]
  tableFieldTitles: string[]
  makeTableRowContent: (record: Rec) => (JQuery | string)[]
  makeSearchableContent: (record: Rec) => string[]
  title: string
  pluralTitle: string
  makeLabel: (record: Rec) => string
}
export type UnprocessedResourceInfo = {
  fields: [string, FormFieldType][] // name, string/number, type
  fieldNameMap: FieldNameMap // name | [name, info?]
  tableFieldTitles: string[]
  makeTableRowContent: (record: Rec) => (JQuery | string)[]
  makeSearchableContent: (record: Rec) => string[]
  title: string
  pluralTitle: string
  makeLabel: (record: Rec) => string
}

export function processResourceInfo(
  conf: UnprocessedResourceInfo
): ResourceInfo {
  conf.fields.push(["id", IdField()], ["date", NumberField("number")])
  let fields: ResourceFieldInfo[] = []
  for (const [name, type] of conf.fields) {
    const x = conf.fieldNameMap[name]
    fields.push({
      title: typeof x === "string" ? x : x[0],
      ...(Array.isArray(x) && { info: x[1] }),
      name,
      type
    })
  }
  return {
    fields,
    makeTableRowContent: conf.makeTableRowContent,
    makeSearchableContent: conf.makeSearchableContent,
    title: conf.title,
    pluralTitle: conf.pluralTitle,
    tableFieldTitles: conf.tableFieldTitles,
    makeLabel: conf.makeLabel
  }
}

export type FieldNameMap = { [name: string]: string | [string, string] }

export function makeBasicStudentConfig(): [string, FormFieldType][] {
  return [
    ["firstName", StringField("text")],
    ["lastName", StringField("text")],
    ["friendlyName", StringField("text")],
    ["friendlyFullName", StringField("text")],
    ["grade", NumberField("number")],
    ["studentId", NumberField("number")],
    ["email", StringField("email", "optional")],
    ["phone", StringField("text", "optional")],
    [
      "contactPref",
      SelectField(["email", "phone", "either"], ["Email", "Phone", "Either"])
    ],
    ["homeroom", StringField("text", "optional")],
    ["homeroomTeacher", StringField("text", "optional")],
    ["attendanceAnnotation", StringField("text", "optional")]
  ]
}

// This maps field names to the words that show up in the UI.
const fieldNameMap: FieldNameMap = {
  firstName: "First name",
  lastName: "Last name",
  friendlyName: "Friendly name",
  friendlyFullName: "Friendly full name",
  grade: ["Grade", "A number from 9-12"],
  learner: "Learner",
  tutor: "Tutor",
  attendance: ["Attendance data", "Do not edit this by hand."],
  status: "Status",
  mods: [
    "Mods",
    "A comma-separated list of numbers from 1-20, corresponding to 1A-10B"
  ],
  dropInMods: [
    "Drop-in mods",
    "A comma-separated list of numbers from 1-20, corresponding to 1A-10B"
  ],
  mod: ["Mod", "A number from 1-20, corresponding to 1A-10B"],
  modsPref: [
    "Preferred mods",
    "A comma-separated list of numbers from 1-20, corresponding to 1A-10B"
  ],
  subjectList: "Subjects",
  request: [
    "Request",
    "This is an ID. You usually will not need to edit this by hand."
  ],
  subject: "Subject(s)",
  studentId: "Student ID",
  email: "Email",
  phone: "Phone",
  contactPref: "Contact preference",
  specialRoom: [
    "Special tutoring room",
    `Leave blank if the student isn't in special tutoring`
  ],
  id: "ID",
  date: ["Date", "Date of creation (do not change)"],
  homeroom: "Homeroom",
  homeroomTeacher: "Homeroom teacher",
  step: ["Step", "A number 1-4."],
  afterSchoolAvailability: "After-school availability",
  attendanceAnnotation: "Attendance annotation",
  additionalHours: [
    "Additional hours",
    "Additional time added to the hours count"
  ],
  isSpecial: "Is special request?",
  annotation: "Annotation",
  chosenBookings: "Chosen bookings"
}

/*

DECLARE INFO FOR EACH RESOURCE

*/

const tutorsInfo: UnprocessedResourceInfo = {
  fields: [
    ...makeBasicStudentConfig(),
    ["mods", NumberArrayField("number")],
    ["modsPref", NumberArrayField("number")],
    ["subjectList", StringField("text")],
    ["attendance", JsonField({})],
    ["dropInMods", NumberArrayField("number")],
    ["afterSchoolAvailability", StringField("text", "optional")],
    ["additionalHours", NumberField("number", "optional")]
  ],
  fieldNameMap,
  tableFieldTitles: ["Name", "Grade", "Mods", "Subjects"],
  makeTableRowContent: record => [
    tutors.createDataEditorMarker(record.id, x => x.friendlyFullName),
    record.grade,
    generateStringOfMods(record.mods, record.modsPref),
    record.subjectList
  ],
  makeSearchableContent: record => [
    tutors.createLabel(record.id, x => x.friendlyFullName),
    String(record.grade),
    generateStringOfMods(record.mods, record.modsPref),
    record.subjectList
  ],
  title: "tutor",
  pluralTitle: "tutors",
  makeLabel: record => record.friendlyFullName
}
const learnersInfo: UnprocessedResourceInfo = {
  fields: [...makeBasicStudentConfig(), ["attendance", JsonField({})]],
  fieldNameMap,
  tableFieldTitles: ["Name", "Grade"],
  makeTableRowContent: record => [
    learners.createDataEditorMarker(record.id, x => x.friendlyFullName),
    record.grade
  ],
  makeSearchableContent: record => [
    learners.createLabel(record.id, x => x.friendlyFullName),
    record.grade
  ],
  title: "learner",
  pluralTitle: "learners",
  makeLabel: record => record.friendlyFullName
}
const requestsInfo: UnprocessedResourceInfo = {
  fields: [
    ["learner", IdField("learners", "optional")],
    ["mods", NumberArrayField("number")],
    ["subject", StringField("text")],
    ["isSpecial", BooleanField()],
    ["annotation", StringField("text", "optional")],
    ["step", NumberField("number")],
    ["chosenBookings", NumberArrayField("number")] // TODO: this is a reference to an array of IDs
  ],
  fieldNameMap,
  tableFieldTitles: ["Learner", "Subject", "Mods"],
  makeTableRowContent: record => [
    record.learner === -1
      ? "SPECIAL"
      : learners.createDataEditorMarker(
          record.learner,
          x => x.friendlyFullName
        ),
    record.subject,
    record.mods.join(", ")
  ],
  makeSearchableContent: record => [
    record.learner === -1
      ? "SPECIAL"
      : learners.createFriendlyMarker(record.learner, x => x.friendlyFullName),
    record.subject,
    record.mods.join(", ")
  ],
  title: "request",
  pluralTitle: "requests",
  makeLabel: record =>
    record.learner === -1
      ? "SPECIAL"
      : learners.createLabel(record.learner, x => x.friendlyFullName)
}

const bookingsInfo: UnprocessedResourceInfo = {
  fields: [
    ["request", IdField("requests")],
    ["tutor", IdField("tutors")],
    ["mod", NumberField("number")],
    [
      "status",
      SelectField(
        ["ignore", "unsent", "waitingForTutor", "selected", "rejected"],
        ["Ignore", "Unsent", "Waiting", "Selected", "Rejected"]
      )
    ]
  ],
  fieldNameMap,
  tableFieldTitles: ["Learner", "Tutor", "Mod", "Status"],
  makeTableRowContent: record => [
    record.learner === -1
      ? "SPECIAL"
      : learners.createDataEditorMarker(
          requests.state.getRecordOrFail(record.request).learner,
          x => x.friendlyFullName
        ),
    tutors.createDataEditorMarker(record.tutor, x => x.friendlyFullName),
    record.mod,
    record.status
  ],
  makeSearchableContent: record => [
    record.learner === -1
      ? "SPECIAL"
      : learners.createLabel(
          requests.state.getRecordOrFail(record.request).learner,
          x => x.friendlyFullName
        ),
    tutors.createLabel(record.tutor, x => x.friendlyFullName),
    record.mod,
    record.status
  ],
  title: "booking",
  pluralTitle: "bookings",
  makeLabel: record =>
    tutors.state.getRecordOrFail(record.tutor).friendlyFullName +
    " <> " +
    (requests.state.getRecordOrFail(record.request).learner === -1
      ? "SPECIAL"
      : learners.state.getRecordOrFail(
          requests.state.getRecordOrFail(record.request).learner
        ).friendlyFullName)
}

const matchingsInfo: UnprocessedResourceInfo = {
  fields: [
    ["learner", IdField("learners", "optional")],
    ["tutor", IdField("tutors")],
    ["subject", StringField("text")],
    ["mod", NumberField("number")],
    ["annotation", StringField("text", "optional")]
  ],
  fieldNameMap,
  tableFieldTitles: ["Learner", "Tutor", "Mod", "Subject", "Status"],
  makeTableRowContent: record => [
    record.learner === -1
      ? "SPECIAL"
      : learners.createDataEditorMarker(
          record.learner,
          x => x.friendlyFullName
        ),
    tutors.createDataEditorMarker(record.tutor, x => x.friendlyFullName),
    record.mod,
    record.subject
  ],
  makeSearchableContent: record => [
    record.learner === -1
      ? "SPECIAL"
      : learners.createLabel(record.learner, x => x.friendlyFullName),
    tutors.createLabel(record.tutor, x => x.friendlyFullName),
    record.mod,
    record.subject
  ],
  title: "matching",
  pluralTitle: "matchings",
  makeLabel: record =>
    tutors.state.getRecordOrFail(record.tutor).friendlyFullName +
    " <> " +
    (record.learner === -1
      ? "SPECIAL"
      : learners.state.getRecordOrFail(record.learner).friendlyFullName)
}

const requestSubmissionsInfo: UnprocessedResourceInfo = {
  fields: [
    ...makeBasicStudentConfig(),
    ["mods", NumberArrayField("number")],
    ["subject", StringField("text")],
    ["isSpecial", BooleanField()],
    ["annotation", StringField("text", "optional")]
  ],
  fieldNameMap,
  tableFieldTitles: ["Name", "Mods", "Subject"],
  makeTableRowContent: record => [
    record.friendlyFullName,
    record.mods.join(", "),
    record.subject
  ],
  makeSearchableContent: record => [
    record.friendlyFullName,
    record.mods.join(", "),
    record.subject
  ],
  title: "request submission",
  pluralTitle: "request submissions",
  makeLabel: record => record.friendlyFullName
}

/*

LET'S PULL IT ALL TOGETHER

*/

export const tutors = new Resource("tutors", processResourceInfo(tutorsInfo))
export const learners = new Resource(
  "learners",
  processResourceInfo(learnersInfo)
)
export const requests = new Resource(
  "requests",
  processResourceInfo(requestsInfo)
)
export const bookings = new Resource(
  "bookings",
  processResourceInfo(bookingsInfo)
)
export const matchings = new Resource(
  "matchings",
  processResourceInfo(matchingsInfo)
)
export const requestSubmissions = new Resource(
  "requestSubmissions",
  processResourceInfo(requestSubmissionsInfo)
)
export const resources: { [resourceName: string]: Resource } = {
  tutors,
  learners,
  bookings,
  matchings,
  requests,
  requestSubmissions
}
export function getResourceByName(name: string) {
  if (resources[name] === undefined) {
    throw new Error("getResourceByName: " + JSON.stringify({ name }))
  }
  return resources[name]
}

export async function forceRefreshAllResources(): Promise<void> {
  const result = await askServer([
    "command",
    "retrieveMultiple",
    Object.keys(resources)
  ])
  for (const resource of Object.values(resources)) {
    if (result.status === AskStatus.ERROR) {
      resource.state.changeTo(result)
    } else {
      resource.state.changeTo({
        status: AskStatus.LOADED,
        val: result.val[resource.name]
      })
    }
  }
}
/*

VERY USEFUL FOR DEBUG

*/

window["appDebug"] = () => resources
