import  mapboxgl from 'mapbox-gl'
/* Idea from Stack Overflow https://stackoverflow.com/a/51683226  */
export class MapboxGLButtonControl extends mapboxgl.GeolocateControl{
    private _title: string;
    private _className: string;
    private _eventHandler: any;
    private _btn: HTMLButtonElement|null = null;
    private _container: HTMLDivElement|null = null;
    private _map: mapboxgl.Map|undefined;
    constructor({
      className = "",
      title = "",
      eventHandler = ()=>{}
    }) {
      super();
      this._className = className;
      this._title = title;
      this._eventHandler = eventHandler;
    }
  
    onAdd(map:mapboxgl.Map) {
      this._btn = document.createElement("button");
      this._btn.className = "mapboxgl-ctrl-icon" + " " + this._className;
      this._btn.type = "button";
      this._btn.title = this._title;
      this._btn.onclick = this._eventHandler;
  
      this._container = document.createElement("div");
      this._container.className = "mapboxgl-ctrl-group mapboxgl-ctrl";
      this._container.appendChild(this._btn);
  
      return this._container;
    }
  
    onRemove() {
      this._container?.parentNode?.removeChild(this._container);
      this._map = undefined;
    }
  }