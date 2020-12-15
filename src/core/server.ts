import {
  MyTesting,
  Resource,
  RecCollection,
  tutors,
  learners,
  bookings,
  matchings,
  requests,
  requestSubmissions,
  stringifyError,
  ResourceInfo,
  Rec
} from "./shared"

function failAfterFiveSeconds<T>(p: Promise<T>): Promise<T> {
  return new Promise((res, rej) => {
    setTimeout(
      () =>
        rej(
          JSON.stringify({
            error: true,
            message: "Server is not responding",
            val: null
          })
        ),
      5000
    )
    p.then(res)
  })
}

export function convertServerStringToAskFinished<T>(str: any): AskFinished<T> {
  try {
    if (str === null) {
      throw new Error("server response was NULL; try refreshing the page")
    }
    if (typeof str !== "string") {
      throw new Error("server response not in correct type")
    } else {
      try {
        const response: ServerResponse<T> = JSON.parse(str)
        if (
          typeof response !== "object" ||
          typeof response.error !== "boolean"
        ) {
          throw new Error("server response not in correct type")
        } else if (response.error) {
          const v: AskError = {
            status: AskStatus.ERROR,
            message: response.message
          }
          return v
        } else {
          const v: AskLoaded<T> = {
            status: AskStatus.LOADED,
            val: response.val
          }
          return v
        }
      } catch (err) {
        throw new Error("parsing issue >> " + stringifyError(err))
      }
    }
  } catch (err) {
    const v: AskError = {
      status: AskStatus.ERROR,
      message: "during convert >> " + stringifyError(err)
    }
    return v
  }
}
export function getResultOrFail<T>(askFinished: AskFinished<T>): T {
  if (askFinished.status == AskStatus.ERROR) {
    throw askFinished.message
  } else {
    return askFinished.val
  }
}
export async function askServer(args: any[]): Promise<AskFinished<any>> {
  let result: string = JSON.stringify({
    error: true,
    val: null,
    message: "Mysterious error"
  })
  try {
    if (window["APP_DEBUG_MOCK"] !== 1) {
      console.log("[server]    args", args)
      if (args[0] === "command") {
        result = await realServer(args)
      } else {
        result = await failAfterFiveSeconds(realServer(args))
      }
      console.log("[server]  result", args, "=>", result)
    } else {
      console.log("[MOCK server]   args", args)
      result = await failAfterFiveSeconds(mockServer(args))
      console.log("[MOCK server] result", args, "=>", result)
    }
  } catch (err) {
    result = JSON.stringify({
      status: AskStatus.ERROR,
      message: "askserver error >> " + stringifyError(err)
    })
  }
  return convertServerStringToAskFinished(result)
}

/*
KEY CONCEPT: how data is kept in sync (BUT THIS IS 100% TODO)
Suppose multiple people are using the app at once. When someone sends a change to the server, onClientNotification methods for ALL OTHER clients are called, which basically tell the other clients to "make XYZ change to your local copy of the data".
*/
export async function onClientNotification(args: any[]): Promise<void> {
  console.log("[server notification]", args)
  const getResource: { [name: string]: () => Resource } = {
    tutors: () => tutors,
    learners: () => learners,
    bookings: () => bookings,
    matchings: () => matchings,
    requests: () => requests,
    requestSubmissions: () => requestSubmissions
  }
  if (args[0] === "update") {
    getResource[args[1]]().state.onServerNotificationUpdate(args[2] as Rec)
  }
  if (args[0] === "delete") {
    getResource[args[1]]().state.onServerNotificationDelete(args[2] as number)
  }
  if (args[0] === "create") {
    getResource[args[1]]().state.onServerNotificationCreate(args[2] as Rec)
  }
}

export type ServerResponse<T> = {
  error: boolean
  val: T
  message: string
}

// An ASK is a request sent to the server. Either the ASK is loading, or it is loaded successfully, or there is an error.

export enum AskStatus {
  LOADING = "LOADING",
  LOADED = "LOADED",
  ERROR = "ERROR"
}

export type Ask<T> = AskLoading | AskFinished<T>

export type AskLoading = { status: AskStatus.LOADING }
export type AskFinished<T> = AskLoaded<T> | AskError

export type AskError = {
  status: AskStatus.ERROR
  message: string
}

export type AskLoaded<T> = {
  status: AskStatus.LOADED
  val: T
}

async function realServer(args: any[]): Promise<string> {
  function getGoogleAppsScriptEndpoint() {
    if (
      window["google"] === undefined ||
      window["google"].script === undefined
    ) {
      // This will be displayed to the user
      throw "You should turn on testing mode. Click OTHER >> TESTING MODE."
    }
    return window["google"].script.run
  }
  let result: any = "Mysterious error"
  try {
    result = await new Promise((res, rej) => {
      getGoogleAppsScriptEndpoint()
        .withFailureHandler(rej)
        .withSuccessHandler(res)
        .onClientAsk(args)
    })
    // NOTE: an "error: true" response is still received by the client through withSuccessHandler().
  } catch (err) {
    result = JSON.stringify({
      error: true,
      val: null,
      message: stringifyError(err)
    })
  }
  if (typeof result !== "string") {
    result = JSON.stringify({
      error: true,
      val: null,
      message: stringifyError("not a string: " + String(result))
    })
  }
  return result
}

async function mockServer(args: any[]): Promise<any> {
  let rawResult: any = "Mysterious error"

  // only for resources so far
  try {
    const mockArgs = JSON.parse(JSON.stringify(args))

    if (args[0] === "command") {
      if (args[1] === "syncDataFromForms") {
        throw new Error(
          "command syncDataFromForms is not supported on the testing server"
        )
      } else if (args[1] === "recalculateAttendance") {
        throw new Error(
          "command recalculateAttendance is not supported on the testing server"
        )
      } else if (args[1] === "generateSchedule") {
        throw new Error(
          "command generateSchedule is not supported on the testing server"
        )
      } else if (args[1] === "retrieveMultiple") {
        const resourceNames: string[] = args[2]
        rawResult = {}
        for (const resourceName of resourceNames) {
          rawResult[resourceName] =
            mockResourceServerEndpoints[resourceName].contents
        }
      } else {
        throw new Error(
          `command [unknown] is not supported on the testing server ${JSON.stringify(
            {
              args
            }
          )}`
        )
      }
    } else {
      rawResult = await mockResourceServerEndpoints[
        mockArgs[0]
      ].processClientAsk(mockArgs.slice(1))
    }
    return JSON.stringify(mockSuccess(rawResult))
  } catch (err) {
    rawResult = stringifyError(err)
  }

  return JSON.stringify(mockError(rawResult))
}

// The point of the mock server is for demos, where we don't want to link to the real spreadsheet with the real data.

function mockSuccess(val: any): ServerResponse<any> {
  return {
    error: false,
    message: null,
    val
  }
}

function mockError(message: string): ServerResponse<any> {
  return {
    error: true,
    message,
    val: null
  }
}

class MockResourceServerEndpoint {
  resource: () => Resource
  public contents: RecCollection
  nextKey: number = 1000 // default ID is an arbitrary high number for testing purposes

  constructor(resource: () => Resource, contents: RecCollection) {
    // IMPORTANT: the resource field is ":() => Resource" intentionally.
    // The general rule is that exported variables from another module
    // aren't available until runtime.

    // Making it ":Resource" directly, results in an error.

    this.resource = resource
    this.contents = contents
  }

  processClientAsk(args: any[]): any {
    if (args[0] === "retrieveAll") {
      return this.contents
    }
    if (args[0] === "update") {
      this.contents[String(args[1].id)] = args[1]
      onClientNotification(["update", this.resource().name, args[1]])
      return null
    }
    if (args[0] === "create") {
      if (args[1].date === -1) {
        args[1].date = Date.now()
      }
      if (args[1].id === -1) {
        args[1].id = this.nextKey
        ++this.nextKey
      }
      this.contents[String(args[1].id)] = args[1]
      onClientNotification(["create", this.resource().name, args[1]])
      return this.contents[String(args[1].id)]
    }
    if (args[0] === "delete") {
      delete this.contents[String(args[1])]
      onClientNotification(["delete", this.resource().name, args[1]])
      return null
    }
    throw new Error("args not matched")
  }
}

// You can edit this to add fake demo data, if you want.

export const mockResourceServerEndpoints: {
  [resourceName: string]: MockResourceServerEndpoint
} = {
  tutors: new MockResourceServerEndpoint(() => tutors, {
    "1561605140223": {
      id: 1561605140223,
      date: 1561267154650,
      friendlyFullName: "Jordan McCann",
      friendlyName: "Jordan",
      firstName: "Jordan",
      lastName: "McCann",
      grade: 10,
      studentId: 99999,
      email: "foobar@icloud.com",
      phone: "5181234567",
      contactPref: "phone",
      homeroom: "H123",
      homeroomTeacher: "HRTeacher",
      mods: [1, 2, 3, 6, 11, 12, 16],
      modsPref: [3],
      subjectList: "English",
      attendance: {},
      dropInMods: [3]
    }
  }),
  learners: new MockResourceServerEndpoint(() => learners, {
    "1567531044346": {
      id: 1567531044346,
      date: 1567531044346,
      friendlyFullName: "Jeffrey Huang",
      friendlyName: "Jeffrey",
      firstName: "Jeffrey",
      lastName: "Huang",
      grade: 0,
      studentId: 8355,
      email: "asdfasdf@gmail.com",
      phone: "555-555-5555",
      homeroom: "H123",
      homeroomTeacher: "HRTeacher",
      contactPref: "either",
      attendance: {}
    }
  }),
  bookings: new MockResourceServerEndpoint(() => bookings, {}),
  matchings: new MockResourceServerEndpoint(() => matchings, {}),
  requests: new MockResourceServerEndpoint(() => requests, {}),
  requestSubmissions: new MockResourceServerEndpoint(() => requestSubmissions, {
    "1567530880861": {
      id: 1567530880861,
      date: 1562007565571,
      friendlyFullName: "Jeffrey Huang",
      friendlyName: "Jeffrey",
      firstName: "Jeffrey",
      lastName: "Huang",
      grade: 0,
      studentId: 8355,
      email: "asdfasdf@gmail.com",
      phone: "555-555-5555",
      contactPref: "either",
      homeroom: "H123",
      homeroomTeacher: "HRTeacher",
      mods: [3],
      subject: "English",
      specialRoom: "",
      status: "unchecked"
    },
    "1567530880981": {
      id: 1567530880981,
      date: 1562100813234,
      friendlyFullName: "Mary Jane",
      friendlyName: "Mary",
      firstName: "Mary",
      lastName: "Jane",
      grade: 0,
      studentId: 16234,
      email: "s",
      phone: "s",
      contactPref: "email",
      homeroom: "H123",
      homeroomTeacher: "HRTeacher",
      mods: [3],
      subject: "Math",
      specialRoom: "",
      status: "unchecked"
    },
    "1567530882754": {
      id: 1567530882754,
      date: 1562028050971,
      friendlyFullName: "John Doe",
      friendlyName: "John",
      firstName: "John",
      lastName: "Doe",
      grade: 0,
      studentId: 12345,
      email: "undefined",
      phone: "undefined",
      contactPref: "either",
      homeroom: "H123",
      homeroomTeacher: "HRTeacher",
      mods: [3],
      subject: "all subjects",
      specialRoom: "B812",
      status: "unchecked"
    }
  })
}
