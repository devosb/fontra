export async function getRemoteProxy(wsURL) {
  const remote = new RemoteObject(wsURL);
  await remote.connect();
  const app = new Proxy(remote, {
    get: (remote, propertyName, app) => {
      if (propertyName === "then") {
        // Some introspection tries to see whether we can do "then",
        // and will treat us as a promise...
        return undefined;
      }
      return function ( /* var args */ ) {
        return remote.doCall(propertyName, Array.from(arguments))
      };
    }
  });
  return app;
}


export class RemoteObject {

  constructor(wsURL) {
    this.wsURL = wsURL;
    this._callReturnCallbacks = {};

    const g =_genNextCallID();
    this._getNextCallID = () => {return g.next().value};
  }

  connect() {
    this.websocket = new WebSocket(this.wsURL);
    this.websocket.onmessage = (event) => this._handleIncomingMessage(event);
    return new Promise((resolve, reject) => {
      this.websocket.onopen = resolve;
      this.websocket.onerror = reject;
    })
  }

  _handleIncomingMessage(event) {
    const message = JSON.parse(event.data);
    const callID = message["call-id"];

    // console.log("incoming message");
    // console.log(message);
    if (callID !== undefined) {
      const returnCallbacks = this._callReturnCallbacks[callID];
      if (message.exception !== undefined) {
        returnCallbacks.reject(message["exception"]);
      } else {
        returnCallbacks.resolve(message["return-value"]);
      }
      delete this._callReturnCallbacks[callID];
    }
  }

  doCall(methodName, args) {
    const callID = this._getNextCallID();
    const message = {
      "call-id": callID,
      "method-name": methodName,
      "arguments": args,
    };
    // console.log("outgoing")
    // console.log(message)
    // console.log("args", args);
    // console.log("args", JSON.stringify(args));
    this.websocket.send(JSON.stringify(message));

    this._callReturnCallbacks[callID] = {}
    return new Promise((resolve, reject) => {
      this._callReturnCallbacks[callID]["resolve"] = resolve;
      this._callReturnCallbacks[callID]["reject"] = reject;
    });
  }

}


function* _genNextCallID() {
  let callID = 0;
  while (true) {
    yield callID;
    callID++;
  }
}
