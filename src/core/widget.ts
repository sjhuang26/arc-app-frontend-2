import {
  container,
  state,
  Widget,
  tutors,
  learners,
  requests,
  requestSubmissions,
  matchings,
  bookings,
  stringifyError,
  Rec,
  stringifyMod,
  alertError,
  arrayEqual,
  resources,
  getResourceByName,
  forceRefreshAllResources,
  ModStatus,
  SchedulingReference,
  schedulingTutorIndex
} from "./shared"
import {
  ButtonWidget,
  showModal,
  ErrorWidget,
  FormSelectWidget,
  FormToggleWidget,
  MessageTemplateWidget,
  ListGroupNavigationWidget,
  FormTextareaWidget
} from "../widgets/ui"
import { TableWidget } from "../widgets/Table"
import { AskStatus, getResultOrFail, askServer } from "./server"
import {
  runDataChecker,
  DataCheckerProblem,
  DataCheckerTag
} from "./datachecker"

/*

BASIC UTILITIES

*/

async function isOperationConfirmedByUser(args: {}): Promise<boolean> {
  return new Promise(async res => {
    await showModal("Are you sure?", "", bb => [
      bb("No", "outline-secondary"),
      bb("Yes", "primary", () => res(true))
    ])
    res(false)
  })
}

const navigationBarString = `
<ul class="nav nav-pills">
    <li class="nav-item dropdown">
        <a class="nav-link dropdown-toggle" data-toggle="dropdown">Commands</a>
        <div class="dropdown-menu dropdown-menu-right">
            <a class="dropdown-item">Sync data from forms</a>
            <a class="dropdown-item">Generate schedule</a>
            <a class="dropdown-item">Recalculate attendance</a>
        </div>
    </li>
    <li class="nav-item dropdown">
        <a class="nav-link dropdown-toggle" data-toggle="dropdown">Advanced data editor</a>
        <div class="dropdown-menu dropdown-menu-right">
            <a class="dropdown-item">Tutors</a>
            <a class="dropdown-item">Learners</a>
            <a class="dropdown-item">Requests</a>
            <a class="dropdown-item">Request submissions</a>
            <a class="dropdown-item">Bookings</a>
            <a class="dropdown-item">Matchings</a>
        </div>
    </li>
    <li class="nav-item dropdown">
        <a class="nav-link dropdown-toggle" data-toggle="dropdown">Scheduling steps</a>
        <div class="dropdown-menu dropdown-menu-right">
            <a class="dropdown-item">Handle requests</a>
            <a class="dropdown-item">Edit schedule</a>
        </div>
    </li>
    <li class="nav-item">
        <a class="nav-link">Attendance</a>
    </li>
    <li class="nav-item">
        <a class="nav-link">After-school availability</a>
    </li>
    <li class="nav-item dropdown">
        <a class="nav-link dropdown-toggle" data-toggle="dropdown">Other</a>
        <div class="dropdown-menu dropdown-menu-right">
            <a class="dropdown-item">About</a>
            <a class="dropdown-item">Run datachecker</a>
            <a class="dropdown-item">Force refresh</a>
            <a class="dropdown-item">Testing mode</a>
        </div>
    </li>
</ul>`

function showTestingModeWarning() {
  showModal(
    "Testing mode loaded",
    "The app has been disconnected from the actual database/forms and replaced with a database with test data.",
    bb => [bb("OK", "primary")]
  )
}

/*

LOTS OF FUNCTIONS!!!!!

IF YOU WANT ANY HOPE OF UNDERSTANDING THIS CODE, READ THE BOTTOM FIRST.

*/

function showStep3Messager(bookingId: number) {
  const b = bookings.state.getRecordOrFail(bookingId)
  const r = requests.state.getRecordOrFail(b.request)
  const t = tutors.state.getRecordOrFail(b.tutor)
  const l = r.learner === -1 ? -1 : learners.state.getRecordOrFail(r.learner)

  const dom = $("<div></div>")

  if (r.isSpecial === true) {
    dom.append(
      $(
        '<strong><p class="lead">This is a special request. Consider the following information when writing your message.</p></strong>'
      )
    )
    dom.append(container("<p>")(r.annotation))
  }
  dom.append($("<p>Contact the tutor:</p>"))
  dom.append(
    MessageTemplateWidget(
      `This is to confirm that starting now, you will be tutoring ${
        l === -1 ? "<SPECIAL REQUEST -- FILL IN INFO>" : l.friendlyFullName
      } in subject ${r.subject} during mod ${stringifyMod(b.mod)}.`
    ).dom
  )

  if (r.isSpecial) {
    dom.append(
      $(
        "<p>Because this is a special request, you do not need to contact the learner."
      )
    )
  } else {
    dom.append($("<p>Contact the learner:</p>"))
    dom.append(
      MessageTemplateWidget(
        `This is to confirm that starting now, you will be tutored by ${
          t.friendlyFullName
        } in subject ${r.subject} during mod ${stringifyMod(b.mod)}.`
      ).dom
    )
  }

  showModal("Messager", dom, bb => [bb("OK", "primary")])
}

function showStep1Messager(bookingId: number) {
  const b = bookings.state.getRecordOrFail(bookingId)
  const r = requests.state.getRecordOrFail(b.request)
  const t = tutors.state.getRecordOrFail(b.tutor)
  const l = learners.state.getRecordOrFail(r.learner)

  const dom = $("<div></div>")

  if (b.status === "unsent") {
    dom.append($("<p>Contact the tutor:</p>"))
    dom.append(
      MessageTemplateWidget(
        `Hi! Can you tutor a student in ${r.subject} on mod ${stringifyMod(
          b.mod
        )}?`
      ).dom
    )
  }
  if (b.status === "waitingForTutor") {
    dom.append($("<p>You are waiting for the tutor.</p>"))
  }

  showModal(
    "Messager",
    container("<div>")(
      container("<h1>")(
        "Messager for ",
        learners.createDataEditorMarker(r.learner, x => x.friendlyFullName),
        " <> ",
        tutors.createDataEditorMarker(b.tutor, x => x.friendlyFullName)
      ),
      dom
    ),
    bb => [bb("OK", "primary")]
  )
}

function showAfterSchoolAvailablityModal() {
  try {
    const tutorRecords = tutors.state.getRecordCollectionOrFail()
    const filtered: number[] = []
    const table = TableWidget(["Name", "Availability"], (id: number) => [
      tutors.createDataEditorMarker(id, x => x.friendlyFullName),
      tutors.createLabel(id, x => x.afterSchoolAvailability)
    ])
    for (const tutor of Object.values(tutorRecords)) {
      if (tutor.afterSchoolAvailability !== "") {
        filtered.push(tutor.id)
      }
    }
    table.setAllValues(filtered)
    showModal("After-school availability", table.dom, bb => [
      bb("Close", "primary")
    ])
  } catch (e) {
    alertError(e)
  }
}

async function requestChangeToStep4(requestId: number, onFinish: () => void) {
  const { closeModal } = showModal("Saving...", "", bb => [], true)
  try {
    const r = requests.state.getRecordOrFail(requestId)
    for (const bookingId of r.chosenBookings) {
      const b = bookings.state.getRecordOrFail(bookingId)
      // ADD MATCHING
      await matchings.state.createRecord({
        learner: r.learner,
        tutor: b.tutor,
        subject: r.subject,
        mod: b.mod,
        annotation: r.annotation,
        id: -1,
        date: -1
      })
    }

    // DELETE ALL BOOKINGS ASSOCIATED WITH REQUEST
    for (const booking of Object.values(
      bookings.state.getRecordCollectionOrFail()
    )) {
      if (booking.request === r.id) {
        await bookings.state.deleteRecord(booking.id)
      }
    }
    // DELETE THE REFERENCE TO THE BOOKING & ADVANCE THE STEP
    r.step = 4
    r.chosenBookings = []
    // NOTE: a matching is designed in the system to automatically take precedence over any of the drop-ins.
    // The drop-in array for the tutor will still include the mod.
    await requests.state.updateRecord(r)
  } catch (err) {
    alertError(err)
  } finally {
    closeModal()
    onFinish()
  }
}

async function requestChangeToStep3(requestId: number, onFinish: () => void) {
  const { closeModal } = showModal("Saving...", "", () => [], true)
  try {
    const r = requests.state.getRecordOrFail(requestId)
    r.step = 3
    await requests.state.updateRecord(r)
  } catch (err) {
    alertError(err)
  } finally {
    closeModal()
    onFinish()
  }
}

async function requestChangeToStep2(
  requestId: number,
  chosenBookings: number[],
  onFinish: () => void
): Promise<boolean> {
  if (await isOperationConfirmedByUser("Are you sure?")) {
    if (chosenBookings.length === 0) {
      showModal("You haven't marked any bookings as selected.", "", bb => [
        bb("OK", "primary")
      ])
      return false
    }
    const { closeModal } = showModal("Saving...", "", bb => [], true)
    try {
      const r = requests.state.getRecordOrFail(requestId)
      r.chosenBookings = chosenBookings
      r.step = 2
      // update record
      requests.state.updateRecord(r)
    } catch (err) {
      alertError(err)
    } finally {
      closeModal()
      onFinish()
    }
    return true
  } else {
    return false
  }
}
interface NavigationScope {
  generateMainContentPanel(navigationState: any[]): JQuery | null
  sidebar?: JQuery
}
function runDatacheckerNavigationScope(
  renavigate: (newNavigationState: any[], keepScope: boolean) => void
): NavigationScope {
  function generateDatacheckerTag(tag: DataCheckerTag) {
    const subtags: JQuery[] = []

    if (tag.resource !== undefined) {
      subtags.push(
        container("<span>")(
          container("<strong>")(`Relevant item (${tag.resource})`)
        )
      )
    }
    if (tag.id !== undefined) {
      subtags.push(
        container("<span>")(
          `ID#${tag.id} `,
          getResourceByName(tag.resource).createDataEditorMarker(
            tag.id,
            () => "(OPEN)"
          )
        )
      )
    }
    if (tag.idResource !== undefined) {
      subtags.push(container("<span>")(`[ID refers to ${tag.idResource}]`))
    }
    if (tag.text !== undefined) {
      subtags.push(container("<span>")(tag.text))
    }
    if (tag.field !== undefined) {
      subtags.push(container("<span>")(tag.field))
    }
    if (tag.value !== undefined) {
      subtags.push(container("<span>")(tag.value))
    }
    if (tag.type !== undefined) {
      subtags.push(container("<span>")(`[format=${tag.type}]`))
    }
    return container('<ul class="list-group my-4">')(
      subtags.map(subtag => container('<li class="list-group-item">')(subtag))
    )
  }
  return {
    generateMainContentPanel() {
      const datacheckerResults = runDataChecker()
      const table = TableWidget<{ problem: DataCheckerProblem; index: number }>(
        ["Text", "Details"],
        ({ problem, index }) => {
          return [
            problem.text,
            ButtonWidget("Details", () => {
              const { closeModal } = showModal(
                `Datachecker problem #${index + 1}`,
                container("<div>")(
                  container('<p class="lead">')(problem.text),
                  ...problem.tags.map(tag => generateDatacheckerTag(tag))
                ),
                bb => [bb("OK", "primary", () => closeModal())]
              )
            }).dom
          ]
        }
      )
      table.setAllValues(
        datacheckerResults.problems.map((problem, index) => ({
          problem,
          index
        }))
      )
      return container('<div class="overflow-auto">')(
        $("<h1>Datachecker</h1>"),
        container('<p class="lead">')(
          `${datacheckerResults.numValidFields} valid fields found`
        ),
        container('<p class="lead">')(
          `${datacheckerResults.problems.length} problems found`
        ),
        table.dom
      )
    }
  }
}
function requestsNavigationScope(
  renavigate: (newNavigationState: any[], keepScope: boolean) => void
): NavigationScope {
  // TYPES AND UTILITIES
  type BookingsInfo = { tutorId: number; mod: number }[]
  type RequestIndex = {
    [id: number]: { id: number; hasBookings: boolean; uiStep: number }
  }
  type TutorIndex = {
    [id: string]: {
      id: number
      matchedMods: number[]
      bookedMods: number[]
    }
  }
  function stepToName(step: number) {
    if (step === 0) return "not started"
    if (step === 1) return "booking"
    if (step === 2) return "pass"
    if (step === 3) return "confirmation"
    return "???"
  }

  // MAJOR FUNCTIONS
  function generateEditBookingsTable({
    bookingsInfo,
    tutorIndex,
    request
  }: {
    bookingsInfo: BookingsInfo
    tutorIndex: TutorIndex
    request: Rec
  }): JQuery {
    type TableRow = {
      tutorId: number
      mods: TableRowMod[]
    }
    type TableRowMod = {
      mod: number
      isPref: boolean
      isAlreadyBooked: boolean
      isAlreadyDropIn: boolean
    }
    const table = TableWidget(
      ["Tutor", "Book for mods..."],
      ({ tutorId, mods }: TableRow) => {
        const buttonsDom = $("<div></div>")
        for (const { mod, isPref, isAlreadyBooked, isAlreadyDropIn } of mods) {
          const modLabel =
            mod + (isPref ? "*" : "") + (isAlreadyDropIn ? " (drop-in)" : "")
          if (isAlreadyBooked) {
            buttonsDom.append(
              ButtonWidget(modLabel + " (already booked)", () => {}).dom
            )
            continue
          }
          const w = FormToggleWidget(modLabel, "Unbook " + modLabel)
          w.setValue(false)
          w.onChange((newVal: boolean) => {
            if (newVal) {
              bookingsInfo.push({
                tutorId,
                mod
              })
            } else {
              bookingsInfo = bookingsInfo.filter(
                x => x.tutorId !== tutorId || x.mod !== mod
              )
            }
          })
          buttonsDom.append(w.dom)
        }
        return [
          tutors.createDataEditorMarker(tutorId, x => x.friendlyFullName),
          buttonsDom
        ]
      }
    )
    const tableValues: TableRow[] = []
    for (const tutor of Object.values(tutorIndex)) {
      const modResults: TableRowMod[] = []
      for (const mod of request.mods) {
        // ignore tutors who are already matched
        if (!tutor.matchedMods.includes(mod)) {
          const tutorRecord = tutors.state.getRecordOrFail(tutor.id)
          if (tutorRecord.mods.includes(mod)) {
            modResults.push({
              mod,
              isPref: tutorRecord.modsPref.includes(mod),
              isAlreadyBooked: tutor.bookedMods.includes(mod),
              isAlreadyDropIn: tutorRecord.dropInMods.includes(mod)
            })
          }
        }
      }
      if (modResults.length > 0 && tutor.bookedMods.length === 0) {
        tableValues.push({
          tutorId: tutor.id,
          mods: modResults
        })
      }
    }
    table.setAllValues(tableValues)
    return table.dom
  }
  async function attemptRequestSubmissionConversion(
    record: Rec
  ): Promise<void> {
    let learnerId = -1
    if (record.isSpecial) {
      // special request; do nothing
    } else {
      // CREATE LEARNER
      // try to dig up a learner with matching student ID, which would mean
      // that the learner already exists in the database

      const matches: Rec[] = Object.values(learnerRecords).filter(
        x => x.studentId === record.studentId
      )
      if (matches.length > 1) {
        // duplicate learner student IDs??
        // this should be validated in the database
        throw new Error(`duplicate student id: "${record.studentId}"`)
      } else if (matches.length == 0) {
        // create new learner
        const learnerRecord = getResultOrFail(
          await learners.state.createRecord({
            firstName: record.firstName,
            lastName: record.lastName,
            friendlyName: record.friendlyName,
            friendlyFullName: record.friendlyFullName,
            grade: record.grade,
            id: -1,
            date: -1,
            studentId: record.studentId,
            email: record.email,
            phone: record.phone,
            contactPref: record.contactPref,
            homeroom: record.homeroom,
            homeroomTeacher: record.homeroomTeacher,
            attendanceAnnotation: "",
            attendance: {}
          })
        )
        learnerId = learnerRecord.id
      } else {
        // learner already exists
        learnerId = matches[0].id
      }
    }

    // CREATE REQUEST
    getResultOrFail(
      await requests.state.createRecord({
        id: -1,
        date: -1,
        learner: learnerId,
        mods: record.mods,
        subject: record.subject,
        isSpecial: record.isSpecial,
        annotation: record.annotation,
        step: 1,
        chosenBookings: []
      })
    )

    // MARK REQUEST SUBMISSION AS CHECKED
    // NOTE: this is only done if the above steps worked
    // so if there's an error, the request submission won't be obliterated
    record.status = "checked"
    getResultOrFail(await requestSubmissions.state.updateRecord(record))
  }
  function generateRequestsTable(): JQuery {
    const requestsTable = TableWidget(
      ["Request", "Step #", "Open"],
      (i: Rec) => {
        return [
          requests.createDataEditorMarker(i.id, x =>
            x.learner === -1
              ? "SPECIAL"
              : learners.createLabel(x.learner, y => y.friendlyFullName)
          ),
          String(requestIndex[i.id].uiStep),
          ButtonWidget("Open", () => {
            renavigate(["requests", i.id], false)
          }).dom
        ]
      }
    )
    requestsTable.setAllValues(
      Object.values(requestRecords).sort((a, b) => (a.step < b.step ? -1 : 1))
    )
    return requestsTable.dom
  }
  function buildRequestIndex(): RequestIndex {
    const index: RequestIndex = {}
    for (const request of Object.values(requestRecords)) {
      index[request.id] = {
        id: request.id,
        hasBookings: false,
        uiStep: -1
      }
    }
    for (const booking of Object.values(bookingRecords)) {
      index[booking.request].hasBookings = true
    }
    for (const i of Object.values(index)) {
      if (!index[i.id].hasBookings && requestRecords[i.id].step === 1) {
        index[i.id].uiStep = 0
      } else {
        index[i.id].uiStep = requestRecords[i.id].step
      }
    }
    return index
  }
  function buildRSButton(): JQuery {
    return ButtonWidget("Convert new request submissions", async () => {
      const { closeModal } = showModal("Converting...", "", bb => [], true)
      try {
        for (const record of uncheckedRequestSubmissions) {
          await attemptRequestSubmissionConversion(record)
        }
      } catch (e) {
        alertError(e)
      } finally {
        closeModal()
        showModal("Conversion successful", "", bb => [bb("OK", "primary")])
      }
      renavigate(["requests"], false)
    }).dom
  }
  function buildTutorIndex(): TutorIndex {
    const index: TutorIndex = {}
    for (const x of Object.values(tutorRecords)) {
      index[x.id] = {
        id: x.id,
        matchedMods: [],
        bookedMods: []
      }
    }
    for (const x of Object.values(matchingRecords)) {
      index[x.tutor].matchedMods.push(x.mod)
    }
    for (const x of Object.values(bookingRecords)) {
      index[x.tutor].bookedMods.push(x.mod)
    }
    return index
  }
  function generateBookerTable(bookerTableValues: Rec[]): JQuery {
    const bookerTable = TableWidget(
      ["Booked tutor", "Status", "Todo"],
      (booking: Rec) => {
        const formSelectWidget = FormSelectWidget(
          ["ignore", "unsent", "waitingForTutor", "selected", "rejected"],
          ["Ignore", "Unsent", "Waiting", "Selected", "Rejected"]
        )
        formSelectWidget.setValue(booking.status)
        formSelectWidget.onChange(async newVal => {
          booking.status = newVal
          const response = await bookings.state.updateRecord(booking)
          if (response.status === AskStatus.ERROR) {
            alertError(response.message)
          }
        })
        const learnerId = requests.state.getRecordOrFail(booking.request)
          .learner
        return [
          bookings.createFriendlyMarker(booking.id, b =>
            tutors.createLabel(booking.tutor, x => x.friendlyFullName)
          ),
          formSelectWidget.dom,
          ButtonWidget("Todo", () => showStep1Messager(booking.id)).dom
        ]
      }
    )
    bookerTable.setAllValues(bookerTableValues)
    return bookerTable.dom
  }
  function generateEditBookingsButton({
    bookingsInfo,
    tutorIndex,
    request
  }: {
    bookingsInfo: BookingsInfo
    tutorIndex: TutorIndex
    request: Rec
  }): JQuery {
    return ButtonWidget("Edit bookings", () => {
      showModal(
        "Edit bookings",
        generateEditBookingsTable({
          bookingsInfo,
          tutorIndex,
          request
        }),
        bb => [
          bb("Save", "primary", async () => {
            try {
              const { closeModal } = showModal("Saving...", "", bb => [])
              for (const { tutorId, mod } of bookingsInfo) {
                await bookings.state.createRecord({
                  id: -1,
                  date: -1,
                  tutor: tutorId,
                  mod,
                  request: request.id,
                  status: "unsent"
                })
              }
              closeModal()
              renavigate(["requests", request.id], false)
            } catch (err) {
              alertError(err)
            }
          }),
          bb("Cancel", "secondary")
        ]
      )
    }).dom
  }

  // LOAD RESOURCES
  const learnerRecords = learners.state.getRecordCollectionOrFail()
  const bookingRecords = bookings.state.getRecordCollectionOrFail()
  const matchingRecords = matchings.state.getRecordCollectionOrFail()
  const requestRecords = requests.state.getRecordCollectionOrFail()
  const tutorRecords = tutors.state.getRecordCollectionOrFail()
  const requestSubmissionRecords = requestSubmissions.state.getRecordCollectionOrFail()

  // FILTER FOR UNCHECKED REQUEST SUBMISSIONS
  const uncheckedRequestSubmissions = Object.values(
    requestSubmissionRecords
  ).filter(x => x.status === "unchecked")

  // BUILD VARIABLES
  const requestIndex = buildRequestIndex()

  return {
    generateMainContentPanel(navigationState: any[]) {
      // RELEVANT TO ALL STEPS
      const requestId: number = navigationState[0]
      if (requestId === undefined) {
        return null
      }
      const request = requests.state.getRecordOrFail(requestId)

      const header = container('<div class="card">')(
        container('<div class="card-header">')("Helpful info"),
        container('<div class="card-body">')(
          container('<span class="badge badge-secondary">')(
            `Step ${requestIndex[requestId].uiStep} (${stepToName(
              requestIndex[requestId].uiStep
            )})`
          ),
          container("<p>")(
            requests.createFriendlyMarker(requestId, x => "Link to request")
          ),
          container("<p>")(
            "Learner: ",
            request.isSpecial
              ? "SPECIAL REQUEST"
              : learners.createFriendlyMarker(
                  request.learner,
                  x =>
                    `${x.friendlyFullName} (grade = ${x.grade}) (homeroom = ${x.homeroom} ${x.homeroomTeacher})`
                )
          ),
          request.annotation === ""
            ? undefined
            : container("<p>")("Information: ", request.annotation),
          request.step === 3 || request.step === 2
            ? ButtonWidget("go back a step", () => {
                if (request.step === 2) {
                  request.chosenBookings = []
                }
                request.step--
                requests.state.updateRecord(request)
                renavigate(["requests", requestId], false)
              }).dom
            : undefined,
          request.step === 3 || request.step === 2
            ? container("<p>")(
                `${request.chosenBookings.length} booking(s) chosen`
              )
            : undefined
        )
      )

      // LOGIC: We use a toggle structure where:
      // - There is a row of mod buttons
      // - There is add functionality, but not delete functionality (bookings can be individually deleted)
      // - Toggling the button toggles entries in a temporary array of all added bookings [[tutor, mod]] via. filters
      // - Clicking "Save bookings and close" will write to the database
      let bookingsInfo: BookingsInfo = []
      // LOGIC: calculating which tutors work for this request
      // - tutor must not be matched at the target mod
      // - tutor may be matched to another mod
      // - for each tutor, keep track of which mods they've been matched to
      // - SENDS TO TABLE: [ tutorId, [ mod, isPref: boolean ] ]
      const tutorIndex: TutorIndex = buildTutorIndex()

      if (requestIndex[requestId].uiStep < 2) {
        const bookerTableValues = Object.values(
          bookings.state.getRecordCollectionOrFail()
        )
          .filter(x => x.request === requestId)
          .map(x => bookings.state.getRecordOrFail(x.id))

        const uiStep01 = container("<div></div>")(
          header,
          generateBookerTable(bookerTableValues),
          container('<div class="card">')(
            container('<div class="card-body">')(
              ButtonWidget("Move to step 2", () => {
                requestChangeToStep2(
                  requestId,
                  bookerTableValues
                    .filter(booking => booking.status === "selected")
                    .map(booking => booking.id),
                  () => renavigate(["requests", requestId], false)
                )
              }).dom,
              generateEditBookingsButton({
                bookingsInfo,
                tutorIndex,
                request
              })
            )
          )
        )
        return uiStep01
      }
      if (requestIndex[requestId].uiStep === 2) {
        const uiStep2 = container('<div class="jumbotron">')(
          header,
          container("<h1>")(
            "Write a pass for the learner ONLY IF they are in 10th grade"
          ),
          ButtonWidget("Move to step 3", () =>
            requestChangeToStep3(requestId, () =>
              renavigate(["requests", requestId], false)
            )
          ).dom
        )
        return uiStep2
      }
      if (requestIndex[requestId].uiStep === 3) {
        const uiStep3 = container('<div class="jumbotron">')(
          header,
          container("<h1>")("Send a confirmation to the learner"),
          ...request.chosenBookings.map(
            (bookingId: number) =>
              ButtonWidget("Send confirmation", () =>
                showStep3Messager(bookingId)
              ).dom
          ),
          ButtonWidget("Move to step 4", () =>
            requestChangeToStep4(requestId, () =>
              renavigate(["requests", requestId], false)
            )
          ).dom
        )
        return uiStep3
      }
      if (requestIndex[requestId].uiStep === 4) {
        const uiStep4 = container('<div class="jumbotron">')(
          container("<h1>")("This request appears to be done"),
          requests.createFriendlyMarker(
            requestId,
            () => "Open advanced request editor confirmation"
          )
        )
        return uiStep4
      }
    },
    sidebar: container("<div>")(
      container("<h1>")("Requests"),
      uncheckedRequestSubmissions.length > 0 ? buildRSButton() : undefined,
      generateRequestsTable()
    )
  }
}

function scheduleEditNavigationScope(
  renavigate: (newNavigationState: any[], keepScope: boolean) => void
): NavigationScope {
  // LOAD RECORD COLLECTIONS
  const bookingRecords = bookings.state.getRecordCollectionOrFail()
  const matchingRecords = matchings.state.getRecordCollectionOrFail()
  const tutorRecords = tutors.state.getRecordCollectionOrFail()

  // CREATE AN INDEX OF OLD DROP-IN MODS
  const oldDropInModsIndex: { [id: number]: number[] } = {}
  for (const tutor of Object.values(tutorRecords)) {
    oldDropInModsIndex[tutor.id] = tutor.dropInMods
  }

  // CREATE AN INDEX OF EDITED DROP-IN MODS (DEEP COPY)
  const editedDropInModsIndex: { [id: number]: number[] } = JSON.parse(
    JSON.stringify(oldDropInModsIndex)
  )

  // ON SAVE, COMPARE THE TWO INDEXES
  async function onSave() {
    const { closeModal } = showModal("Saving...", "", bb => [], true)
    try {
      let wereChanges = false
      for (const [idString, oldDropInMods] of Object.entries(
        oldDropInModsIndex
      )) {
        oldDropInMods.sort()
        const editedDropInMods = editedDropInModsIndex[idString]
        editedDropInMods.sort()
        if (!arrayEqual(oldDropInMods, editedDropInMods)) {
          wereChanges = true

          // this gets rid of duplicates as well
          tutorRecords[idString].dropInMods = [...new Set(editedDropInMods)]
          getResultOrFail(
            await tutors.state.updateRecord(tutorRecords[idString])
          )
        }
      }
      if (!wereChanges) {
        // no changes
        showModal(
          "No changes were detected in the schedule, so nothing was saved.",
          "",
          bb => [bb("OK", "primary")]
        )
      }
    } catch (e) {
      alertError(e)
    } finally {
      closeModal()
    }
  }

  // INIT DOM
  const availableDomA = container("<div>")()
  const availableDomB = container("<div>")()
  for (let i = 0; i < 10; ++i) {
    availableDomA.append(
      container("<div>")(
        $('<p class="lead"><strong></strong></p>').text(`Mod ${i + 1}`),
        container('<ul class="list-group">')()
      )
    )
  }
  for (let i = 0; i < 10; ++i) {
    availableDomB.append(
      container("<div>")(
        $('<p class="lead"><strong></strong></p>').text(`Mod ${i + 11}`),
        container('<ul class="list-group">')()
      )
    )
  }
  const scheduleDomA = container("<div>")()
  const scheduleDomB = container("<div>")()
  for (let i = 0; i < 10; ++i) {
    scheduleDomA.append(
      container("<div>")(
        $('<p class="lead"><strong></strong></p>').text(`Mod ${i + 1}`),
        container('<ul class="list-group">')()
      )
    )
  }
  for (let i = 0; i < 10; ++i) {
    scheduleDomB.append(
      container("<div>")(
        $('<p class="lead"><strong></strong></p>').text(`Mod ${i + 11}`),
        container('<ul class="list-group">')()
      )
    )
  }
  function popupUtilPlaceElement(
    domA: JQuery,
    domB: JQuery,
    {
      mod,
      element,
      popoverContent
    }: {
      mod: number
      element: JQuery
      popoverContent: () => JQuery
    }
  ) {
    if (mod > 10) {
      domB
        .children()
        .eq(mod - 11)
        .children()
        .eq(1)
        .append(element)
    } else {
      domA
        .children()
        .eq(mod - 1)
        .children()
        .eq(1)
        .append(element)
    }
    const popoverContentDom = $("<div>")
    element.popover({
      content: popoverContentDom[0],
      placement: "auto",
      html: true,
      trigger: "click"
    })
    element.on("show.bs.popover", () => {
      popoverContentDom.empty()
      popoverContentDom.append(popoverContent())
    })
  }
  const tutorIndex = schedulingTutorIndex(
    tutorRecords,
    bookingRecords,
    matchingRecords
  )
  function generatePopupAvailable(id: number, mod: number) {
    const initialStatus = tutorIndex[id].modStatus[mod - 1]
    const element = container(
      '<li class="list-group-item list-group-item-action">'
    )(
      tutors.createLabel(id, x => x.friendlyFullName),
      initialStatus === ModStatus.DROP_IN_PREF ||
        initialStatus === ModStatus.FREE_PREF
        ? "*"
        : ""
    )
    if (
      initialStatus === ModStatus.DROP_IN_PREF ||
      initialStatus === ModStatus.FREE_PREF
    ) {
      element.addClass("text-primary")
    }

    function popoverContent() {
      const popoverContent = container('<div class="btn-group m-2">')()
      popoverContent.append(
        ButtonWidget(`(${tutorIndex[id].refs.length}x)`, () => {}).dom
      )
      for (let i = 0; i < 20; ++i) {
        const status = tutorIndex[id].modStatus[i]
        if (status !== ModStatus.FREE && status !== ModStatus.FREE_PREF)
          continue
        popoverContent.append(
          ButtonWidget(
            String(i + 1) + (status === ModStatus.FREE_PREF ? "*" : ""),
            () => {
              const arr = editedDropInModsIndex[id]
              // add the new mod
              arr.push(i + 1)
              // sort
              arr.sort()
              // edit status index
              tutorIndex[id].modStatus[i] =
                status === ModStatus.FREE_PREF
                  ? ModStatus.DROP_IN_PREF
                  : ModStatus.DROP_IN
              // hide popover
              element.popover("hide")
              // rebind data handler
              generatePopupSchedule(id, i + 1)
            }
          ).dom
        )
      }
      return popoverContent
    }
    popupUtilPlaceElement(availableDomA, availableDomB, {
      mod,
      element,
      popoverContent
    })
  }
  function generatePopupSchedule(id: number, mod: number) {
    const initialStatus = tutorIndex[id].modStatus[mod - 1]
    if (typeof initialStatus !== "string") {
      throw new Error("typecheck failed in generatePopupSchedule")
    }
    const element = container(
      '<li class="list-group-item list-group-item-action">'
    )(
      tutors.createLabel(id, x => x.friendlyFullName),
      initialStatus === ModStatus.DROP_IN_PREF ||
        initialStatus === ModStatus.FREE_PREF
        ? "*"
        : ""
    )
    if (
      initialStatus === ModStatus.DROP_IN_PREF ||
      initialStatus === ModStatus.FREE_PREF
    ) {
      element.addClass("text-primary")
    }
    function popoverContent() {
      const popoverContent = container('<div class="btn-group m-2">')()
      popoverContent.append(
        ButtonWidget(`(${tutorIndex[id].refs.length}x)`, () => {}).dom
      )
      for (let i = 0; i < 20; ++i) {
        const status = tutorIndex[id].modStatus[i]
        if (status !== ModStatus.FREE && status !== ModStatus.FREE_PREF)
          continue
        popoverContent.append(
          ButtonWidget(
            String(i + 1) + (status === ModStatus.FREE_PREF ? "*" : ""),
            () => {
              const arr = editedDropInModsIndex[id]
              // remove the mod
              arr.splice(arr.indexOf(mod), 1)
              // add the mod
              arr.push(i + 1)
              // sort
              arr.sort()
              // edit status index
              tutorIndex[id].modStatus[mod - 1] =
                initialStatus === ModStatus.DROP_IN_PREF
                  ? ModStatus.FREE_PREF
                  : ModStatus.FREE
              tutorIndex[id].modStatus[i] =
                status === ModStatus.FREE_PREF
                  ? ModStatus.DROP_IN_PREF
                  : ModStatus.DROP_IN
              // dispose popover
              element.popover("dispose")
              // destroy element
              element.remove()
              // recreate popup
              generatePopupSchedule(id, i + 1)
            }
          ).dom
        )
      }
      popoverContent.append(
        ButtonWidget("X", () => {
          // remove the mod entirely
          const arr = editedDropInModsIndex[id]
          arr.splice(arr.indexOf(mod), 1)
          // sort
          arr.sort()
          // edit status index
          tutorIndex[id].modStatus[mod - 1] =
            initialStatus === ModStatus.DROP_IN_PREF
              ? ModStatus.FREE_PREF
              : ModStatus.FREE
          // detach element
          element.detach()
          // dispose popover
          element.popover("dispose")
        }).dom
      )
      return popoverContent
    }

    popupUtilPlaceElement(scheduleDomA, scheduleDomB, {
      mod,
      element,
      popoverContent
    })
  }
  function generatePopupScheduleMatch(id: number, mod: number) {
    const initialStatus = tutorIndex[id].modStatus[mod - 1]
    if (!Array.isArray(initialStatus)) {
      throw new Error("typecheck failed in generatePopupScheduleMatch")
    }
    const matchingId = initialStatus[1] as number
    const element = container('<li class="text-danger list-group-item">')(
      matchings.createLabel(
        matchingId,
        x => tutors.createLabel(x.tutor, y => y.friendlyFullName) + " (matched)"
      )
    )

    function popoverContent() {
      return container("<span>")(
        "Details: ",
        matchings.createDomLabel(matchingId, x =>
          container("<span>")(
            "tutor: ",
            tutors.createFriendlyMarker(x.tutor, y => y.friendlyFullName),
            "<> learner: ",
            x.learner === -1
              ? "(SPECIAL)"
              : learners.createFriendlyMarker(
                  x.learner,
                  y => y.friendlyFullName
                ),
            x.annotation === "" ? undefined : ` (INFO: ${x.annotation})`
          )
        )
      )
    }

    popupUtilPlaceElement(scheduleDomA, scheduleDomB, {
      mod,
      element,
      popoverContent
    })
  }
  function generatePopupScheduleBook(
    id: number,
    mod: number,
    bookingId: number
  ) {
    const initialStatus = tutorIndex[id].modStatus[mod - 1]
    if (!Array.isArray(initialStatus)) {
      throw new Error("typecheck failed in generatePopupScheduleBook")
    }
    const element = container(
      '<li class="text-danger list-group-item list-group-item-action">'
    )(tutors.createLabel(id, x => x.friendlyFullName), " (booked)")
    function popoverContent() {
      return container("<span>")(
        "Details:",
        bookings.createDomLabel(bookingId, x =>
          container("<span>")(
            tutors.createFriendlyMarker(x.tutor, y => y.friendlyFullName),
            " <> ",
            requests.createFriendlyMarker(
              x.request,
              y => "link to request",
              () => renavigate(["requests", x.request], false)
            )
          )
        )
      )
    }
    popupUtilPlaceElement(scheduleDomA, scheduleDomB, {
      mod,
      element,
      popoverContent
    })
  }

  for (const { id, modStatus } of Object.values(tutorIndex)) {
    for (let i = 0; i < 20; ++i) {
      const status = modStatus[i]
      if (Array.isArray(status)) {
        if (status[0] === "matched") {
          generatePopupScheduleMatch(id, i + 1)
        }
        if (status[0] === "booked") {
          generatePopupScheduleBook(id, i + 1, status[1] as number)
        }
      }
      if (typeof status === "string") {
        if (status === ModStatus.DROP_IN || status === ModStatus.DROP_IN_PREF) {
          generatePopupAvailable(id, i + 1)
          generatePopupSchedule(id, i + 1)
        }
        if (status === ModStatus.FREE || status === ModStatus.FREE_PREF) {
          generatePopupAvailable(id, i + 1)
        }
      }
    }
  }

  function generateMainContentPanel(newNavigationState: any[]) {
    const day: string = newNavigationState[0] as string
    return container('<div class="layout-h">')(
      container('<div class="layout-v">')(
        container('<h1 class="text-center layout-item-fit">')("Available"),
        container('<div class="overflow-auto p-2">')(
          availableDomA
            .addClass("overflow-auto")
            .toggleClass("d-none", !day.includes("A")),
          availableDomB
            .addClass("overflow-auto")
            .toggleClass("d-none", !day.includes("B"))
        )
      ),
      container('<div class="layout-v">')(
        container('<h1 class="text-center layout-item-fit">')(
          "Schedule",
          ButtonWidget("Save", () => onSave()).dom,
          ButtonWidget("A days", () => renavigate(["scheduleEdit", "A"], true))
            .dom,
          ButtonWidget("B days", () => renavigate(["scheduleEdit", "B"], true))
            .dom,
          ButtonWidget("Both days", () =>
            renavigate(["scheduleEdit", "AB"], true)
          ).dom
        ),
        container('<div class="overflow-auto p-2">')(
          scheduleDomA.toggleClass("d-none", !day.includes("A")),
          scheduleDomB.toggleClass("d-none", !day.includes("B"))
        )
      )
    )
  }
  return {
    generateMainContentPanel
  }
}

function attendanceNavigationScope(
  renavigate: (newNavigationState: any[], keepScope: boolean) => void
): NavigationScope {
  const t = Object.values(tutors.state.getRecordCollectionOrFail())
  const l = Object.values(learners.state.getRecordCollectionOrFail())
  const sidebarTable = TableWidget(
    // Both learners and tutors are students.
    ["Student", "Total hours", "Attendance level", "Details"],
    ({ isLearner, student }: { isLearner: boolean; student: Rec }) => {
      // calculate the attendance level & totals
      let numPresent = 0
      let numExcused = 0
      let numAbsent = 0
      let totalMinutes = 0
      if (student.additionalHours !== undefined) {
        totalMinutes += student.additionalHours
      }
      for (const x of Object.values<any>(student.attendance)) {
        for (const attendanceModDataString of x) {
          const tokens = attendanceModDataString.split(" ")

          const minutes = Number(tokens[1])
          if (minutes === 1) {
            ++numExcused
          } else if (minutes <= 0) {
            ++numAbsent
          } else {
            ++numPresent
            totalMinutes += minutes
          }
        }
      }
      return [
        (isLearner ? learners : tutors).createLabel(
          student.id,
          x => x.friendlyFullName
        ),
        String((totalMinutes / 60).toFixed(1)),
        `${numPresent}P / ${numExcused}EX / ${numAbsent}A`,
        ButtonWidget("Details", () => {
          renavigate(["attendance", student.id], true)
        }).dom
      ]
    }
  )
  const data = t
    .map(x => ({ isLearner: false, student: x }))
    .concat(l.map(x => ({ isLearner: true, student: x })))

  sidebarTable.setAllValues(data)

  return {
    generateMainContentPanel(navigationState: any[]) {
      const studentId: number = navigationState[0]
      if (studentId === undefined) {
        return null
      }
      const matchingStudents = data.filter(x => x.student.id === studentId)
      if (matchingStudents.length !== 1) {
        throw new Error("no matching students with ID")
      }
      const { isLearner, student } = matchingStudents[0]

      const header = container("<h1>")(
        (isLearner ? learners : tutors).createFriendlyMarker(
          student.id,
          x => x.friendlyFullName
        )
      )
      const attendanceAnnotation = FormTextareaWidget()
      attendanceAnnotation.setValue(student.attendanceAnnotation)
      attendanceAnnotation.onChange(async newVal => {
        student.attendanceAnnotation = newVal
        try {
          getResultOrFail(
            await (isLearner ? learners : tutors).state.updateRecord(student)
          )
        } catch (e) {
          alertError(e)
        }
      })
      type AttendanceModData = {
        date: number
        mod: number
        minutes: number
      }
      const table = TableWidget(
        // Both learners and tutors are students.
        ["Date", "Mod", "Present?"],
        (x: AttendanceModData) => {
          return [
            new Date(x.date).toISOString().substring(0, 10),
            String(x.mod),
            x.minutes > 0
              ? x.minutes === 1
                ? "EXCUSED"
                : `P (${x.minutes} minutes)`
              : $('<span style="color:red">ABSENT</span>')
          ]
        }
      )
      const attendanceData: AttendanceModData[] = []
      for (const [dateKey, dateData] of Object.entries<string[]>(
        student.attendance
      )) {
        for (const attendanceModDataString of dateData) {
          const x = attendanceModDataString.split(" ")
          attendanceData.push({
            date: Number(dateKey),
            mod: Number(x[0]),
            minutes: Number(x[1])
          })
        }
      }
      attendanceData.sort((a, b) => {
        // descending by date
        if (a.date < b.date) return 1
        if (a.date > b.date) return -1
        // ascending by mod
        if (a.mod < b.mod) return -1
        if (a.mod > b.mod) return 1
        return 0
      })
      table.setAllValues(attendanceData)
      return container('<div class="overflow-auto">')(
        header,
        $('<p class="lead">Attendance annotation:</p>'),
        attendanceAnnotation.dom,
        table.dom
      )
    },
    sidebar: container('<div class="overflow-auto">')(
      $("<h1>Attendance</h1>"),
      sidebarTable.dom
    )
  }
}

function homepageNavigationScope(): NavigationScope {
  return {
    generateMainContentPanel: () => container("<h1>")("ARC App homepage")
  }
}
function aboutNavigationScope(): NavigationScope {
  return {
    generateMainContentPanel: () =>
      container("<div>")(
        container("<h1>")("About"),
        container("<p>")("Designed by Suhao Jeffrey Huang")
      )
  }
}

/*

ROOT WIDGET

(MAIN ENTRYPOINT)

*/

export function rootWidget(): Widget {
  let navigationState: any[] = []
  let currentNavigationScope = homepageNavigationScope()
  function renavigate(newNavigationState: any[], keepScope: boolean) {
    console.log(newNavigationState, keepScope)
    try {
      navigationState = newNavigationState
      if (keepScope) {
        if (navigationState[0] === "requests") {
          currentNavigationScope.generateMainContentPanel([navigationState[1]])
        }
        if (navigationState[0] === "attendance") {
          currentNavigationScope.generateMainContentPanel([navigationState[1]])
        }
        if (navigationState[0] === "scheduleEdit") {
          currentNavigationScope.generateMainContentPanel([navigationState[1]])
        }
      } else {
        if (newNavigationState[0] === undefined) {
          currentNavigationScope = homepageNavigationScope()
        }
        if (navigationState[0] === "about") {
          currentNavigationScope = aboutNavigationScope()
        }
        if (navigationState[0] === "requests") {
          currentNavigationScope = requestsNavigationScope(renavigate)
        }
        if (navigationState[0] === "scheduleEdit") {
          currentNavigationScope = scheduleEditNavigationScope(renavigate)
        }
        if (navigationState[0] === "attendance") {
          currentNavigationScope = attendanceNavigationScope(renavigate)
        }
        if (navigationState[0] === "runDatachecker") {
          currentNavigationScope = runDatacheckerNavigationScope(renavigate)
        }
        generateSidebar(currentNavigationScope.sidebar, keepScope)
      }
      generateMainContentPanel(
        currentNavigationScope.generateMainContentPanel(
          navigationState.slice(1)
        ),
        keepScope
      )
    } catch (e) {
      alertError(e) // TODO
    }
  }
  function generateSidebar(content: JQuery, keepScope: boolean): void {
    if (!keepScope) {
      // deal with popovers
      $(".popover").popover("dispose")
    } else {
      $(".popover").popover("hide")
    }

    sidebarDom.empty()
    sidebarDom.removeClass("col-4 overflow-auto app-sidebar d-none")
    if (content) {
      sidebarDom.addClass("col-4 overflow-auto app-sidebar")
      sidebarDom.append(content)
    } else {
      sidebarDom.addClass("d-none")
    }
  }
  function generateMainContentPanel(content: JQuery, keepScope: boolean): void {
    if (!keepScope) {
      // deal with popovers
      $(".popover").popover("dispose")
    } else {
      $(".popover").popover("hide")
    }
    mainContentPanelDom.empty()
    mainContentPanelDom.removeClass("col app-content-panel layout-v")
    if (content) {
      mainContentPanelDom.append(content)
      mainContentPanelDom.addClass("col app-content-panel layout-v")
    }
  }
  function generateNavigationBar(): HTMLElement {
    const dom = $(navigationBarString)
    dom
      .find("a")
      .css("cursor", "pointer")
      .click(ev => {
        function command(
          name: string,
          textName: string,
          loadingMessage: string,
          finish: (result: any) => Promise<void>
        ) {
          if (text == textName) {
            ;(async () => {
              const { closeModal } = showModal(loadingMessage, "", bb => [])
              try {
                const result = getResultOrFail(
                  await askServer(["command", name])
                )
                await finish(result)
              } catch (e) {
                alertError(e)
              } finally {
                closeModal()
              }
            })()
          }
        }
        ev.preventDefault()
        const text = $(ev.target).text()

        // DATA EDITOR
        // the data editor isn't considered a navigation state
        if (text == "Tutors") tutors.makeTiledViewAllWindow()
        if (text == "Learners") learners.makeTiledViewAllWindow()
        if (text == "Bookings") bookings.makeTiledViewAllWindow()
        if (text == "Matchings") matchings.makeTiledViewAllWindow()
        if (text == "Request submissions")
          requestSubmissions.makeTiledViewAllWindow()
        if (text == "Requests") requests.makeTiledViewAllWindow()

        // SCHEDULER
        if (text == "Handle requests") {
          renavigate(["requests"], false)
        }
        if (text == "Edit schedule") {
          renavigate(["scheduleEdit", "A"], false)
        }

        // ATTENDANCE
        if (text == "Attendance") {
          renavigate(["attendance"], false)
        }

        // COMMANDS
        command(
          "syncDataFromForms",
          "Sync data from forms",
          "Syncing data...",
          async (result: any) => {
            showModal(
              "Sync successful",
              `${result as number} new form submissions found`,
              bb => [bb("OK", "primary")]
            )
          }
        )

        command(
          "generateSchedule",
          "Generate schedule",
          "Generating schedule...",
          async (result: any) => {
            showModal(
              "Schedule successfully generated",
              `The schedule in the spreadsheet has been updated`,
              bb => [bb("OK", "primary")]
            )
          }
        )

        command(
          "recalculateAttendance",
          "Recalculate attendance",
          "Recalculating attendance...",
          async (result: any) => {
            showModal(
              `Attendance successfully recalculated: ${result} attendances were modified`,
              "",
              bb => [bb("OK", "primary")]
            )
          }
        )

        // MISC
        if (text == "Run datachecker") {
          renavigate(["runDatachecker"], false)
        }
        if (text == "After-school availability") {
          showAfterSchoolAvailablityModal()
        }
        if (text == "About") {
          renavigate(["about"], false)
        }
        if (text == "Force refresh") {
          ;(async () => {
            const { closeModal } = showModal(
              "Loading force refresh...",
              "",
              bb => [],
              true
            )
            await forceRefreshAllResources()
            renavigate(navigationState, false)
            closeModal()
          })()
        }
        if (text == "Testing mode") {
          ;(async () => {
            const { closeModal } = showModal(
              "Loading testing mode...",
              "",
              bb => [],
              true
            )
            window["APP_DEBUG_MOCK"] = 1
            forceRefreshAllResources()
            showTestingModeWarning()
            renavigate([], false)
            closeModal()
          })()
        }
      })

    return dom[0]
  }
  const sidebarDom = container("<div></div>")()
  const mainContentPanelDom = container("<div></div>")()
  const dom = container('<div id="app" class="layout-v"></div>')(
    container(
      '<nav class="navbar layout-item-fit top-ui-card" style="margin: 1rem;">'
    )($('<strong class="mr-4">ARC App</strong>'), generateNavigationBar()),
    container('<div class="row m-4 layout-h">')(sidebarDom, mainContentPanelDom)
  )
  if (window["APP_DEBUG_MOCK"] === 1) showTestingModeWarning()
  return { dom }
}
