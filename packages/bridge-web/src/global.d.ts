interface NekoNativeBridgeObject {
  postMessage(message: string): void;
}

interface Window {
  NekoNativeBridge?: NekoNativeBridgeObject;
}
