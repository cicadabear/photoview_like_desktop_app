import { gql, useQuery } from '@apollo/client'
import mapboxgl from 'mapbox-gl'
import React, { useReducer } from 'react'
import { Helmet } from 'react-helmet'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import Layout from '../../components/layout/Layout'
import { registerMediaMarkers } from '../../components/mapbox/mapboxHelperFunctions'
import useMapboxMap from '../../components/mapbox/MapboxMap'
import { urlPresentModeSetupHook } from '../../components/photoGallery/mediaGalleryReducer'
import MapPresentMarker from './MapPresentMarker'
import { PlacesAction, placesReducer } from './placesReducer'
import { mediaGeoJson } from './__generated__/mediaGeoJson'
import { MapboxGLButtonControl } from './MapboxGLButtonControl'

const MapWrapper = styled.div`
  width: 100%;
  height: calc(100vh - 60px);
`

const MAPBOX_DATA_QUERY = gql`
  query mediaGeoJson {
    myMediaGeoJson
  }
`

export type PresentMarker = {
  id: number | string
  cluster: boolean
}

const getCenterAndZoomFromStorage = () => {
  let savedMapboxData = { lng: 0, lat: 0, zoom: 3 }
  try {
    savedMapboxData = JSON.parse(
      localStorage.getItem('mapbox_data') || '{"lng":0,"lat":0,"zoom":3}'
    )
  } catch (exception) {
    console.log('Exception: ', exception)
  }
  return savedMapboxData
}

const MapPage = () => {
  const { t } = useTranslation()

  const { data: mapboxData } = useQuery<mediaGeoJson>(MAPBOX_DATA_QUERY, {
    fetchPolicy: 'cache-first',
  })

  const [markerMediaState, dispatchMarkerMedia] = useReducer(placesReducer, {
    presenting: false,
    activeIndex: -1,
    media: [],
  })
  const savedMapboxData = getCenterAndZoomFromStorage()
  const { mapContainer, mapboxMap, mapboxToken } = useMapboxMap({
    configureMapbox: configureMapbox({ mapboxData, dispatchMarkerMedia }),
    mapboxOptions: {
      center: savedMapboxData,
      zoom: savedMapboxData.zoom,
      projection: {
        name: 'globe',
      },
    },
  })

  urlPresentModeSetupHook({
    dispatchMedia: dispatchMarkerMedia,
    openPresentMode: event => {
      dispatchMarkerMedia({
        type: 'openPresentMode',
        activeIndex: event.state.activeIndex,
      })
    },
  })

  if (mapboxData && mapboxToken == null) {
    return (
      <Layout title={t('places_page.title', 'Places')}>
        <h1>Mapbox token is not set</h1>
        <p>
          To use map related features a mapbox token is needed.
          <br /> A mapbox token can be created for free at{' '}
          <a href="https://account.mapbox.com/access-tokens/">mapbox.com</a>.
        </p>
        <p>
          Make sure the access token is added as the MAPBOX_TOKEN environment
          variable.
        </p>
      </Layout>
    )
  }

  return (
    <Layout title="Places">
      <Helmet>
        {/* <link rel="stylesheet" href="/mapbox-gl.css" /> */}
        {/* <style type="text/css">{mapboxStyles}</style> */}
      </Helmet>
      <MapWrapper>{mapContainer}</MapWrapper>
      <MapPresentMarker
        map={mapboxMap}
        markerMediaState={markerMediaState}
        dispatchMarkerMedia={dispatchMarkerMedia}
      />
    </Layout>
  )
}

const configureMapbox =
  ({
    mapboxData,
    dispatchMarkerMedia,
  }: {
    mapboxData?: mediaGeoJson
    dispatchMarkerMedia: React.Dispatch<PlacesAction>
  }) =>
  (map: mapboxgl.Map, mapboxLibrary: typeof mapboxgl) => {
    // Add map navigation control
    map.addControl(new mapboxLibrary.NavigationControl())

    const toggleMediaLayer = () => {
      let visibility = map.getLayoutProperty('media', 'visibility')
      if (visibility == 'none') {
        map.setLayoutProperty('media', 'visibility', 'visible')
        document
          .querySelectorAll('.mapboxgl-marker')
          .forEach(a => ((a as HTMLElement).style.display = 'initial'))
      } else {
        map.setLayoutProperty('media', 'visibility', 'none')
        document
          .querySelectorAll('.mapboxgl-marker')
          .forEach(a => ((a as HTMLElement).style.display = 'none'))
      }
    }

    const mediaToggleCtrl = new MapboxGLButtonControl({
      className: 'mapbox-gl-media_ctrl',
      title: 'Toggle Media Layer',
      eventHandler: toggleMediaLayer,
    })
    map.addControl(mediaToggleCtrl)
    map.addControl(new mapboxgl.ScaleControl())

    map.on('idle', () => {
      localStorage.setItem(
        'mapbox_data',
        JSON.stringify({
          lng: map.getCenter().lng,
          lat: map.getCenter().lat,
          zoom: map.getZoom(),
        })
      )
    })

    map.on('load', () => {
      if (map == null) {
        console.error('ERROR: map is null')
        return
      }
      map.resize()

      map.addSource('media', {
        type: 'geojson',
        data: mapboxData?.myMediaGeoJson as never,
        cluster: true,
        clusterRadius: 50,
        clusterProperties: {
          thumbnail: ['coalesce', ['get', 'thumbnail'], false],
        },
      })

      map.addSource('media-points', {
        type: 'geojson',
        data: mapboxData?.myMediaGeoJson as never,
      })

      map.addLayer({
        id: 'media',
        type: 'circle',
        source: 'media',
        filter: ['!', true],
      })

      // Add dummy layer for features to be queryable
      map.addLayer({
        id: 'media-points',
        type: 'circle',
        source: 'media-points',
        paint: {
          'circle-radius': 5,
          'circle-color': '#f08',
          'circle-opacity': 0.7,
        },
      })

      const canvas = map.getCanvasContainer()
      // Disable default box zooming.
      map.boxZoom.disable()
      // Variable to hold the starting xy coordinates
      // when `mousedown` occured.
      let start: mapboxgl.Point

      // Variable to hold the current xy coordinates
      // when `mousemove` or `mouseup` occurs.
      let current: mapboxgl.Point

      // Variable for the draw box element.
      let box: HTMLElement | null

      // Set `true` to dispatch the event before other functions
      // call it. This is necessary for disabling the default map
      // dragging behaviour.
      canvas.addEventListener('mousedown', mouseDown, true)

      // Return the xy coordinates of the mouse position
      function mousePos(e: MouseEvent) {
        const rect = canvas.getBoundingClientRect()
        return new mapboxgl.Point(
          e.clientX - rect.left - canvas.clientLeft,
          e.clientY - rect.top - canvas.clientTop
        )
      }
      document.addEventListener('keydown', onKeyDown)
      document.addEventListener('keyup', onKeyUp)

      function mouseDown(e: MouseEvent) {
        // Continue the rest of the function if the shiftkey is pressed.
        if (!(e.shiftKey && e.button === 0)) return

        // Disable default drag zooming when the shift key is held down.
        map.dragPan.disable()

        // Call functions for the following events
        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
        // Capture the first xy coordinates
        start = mousePos(e)
      }

      function onMouseMove(e: MouseEvent) {
        // Capture the ongoing xy coordinates
        current = mousePos(e)

        canvas.style.cursor = 'crosshair'

        // Append the box element if it doesnt exist
        if (!box) {
          box = document.createElement('div')
          box.classList.add('boxdraw')
          canvas.appendChild(box)
        }

        const minX = Math.min(start.x, current.x),
          maxX = Math.max(start.x, current.x),
          minY = Math.min(start.y, current.y),
          maxY = Math.max(start.y, current.y)

        // Adjust width and xy position of the box element ongoing
        const pos = `translate(${minX}px, ${minY}px)`
        box.style.transform = pos
        box.style.width = maxX - minX + 'px'
        box.style.height = maxY - minY + 'px'
      }

      function onMouseUp(e: MouseEvent) {
        // Capture xy coordinates
        canvas.style.cursor = 'grab'
        finish([start, mousePos(e)])
      }

      function onKeyUp(e: KeyboardEvent) {
        if (e.code.includes('Shift')) {
          canvas.style.cursor = 'grab'
        }
      }

      function onKeyDown(e: KeyboardEvent) {
        if (e.code.includes('Shift')) {
          if (canvas.style.cursor != 'corsshair') {
            canvas.style.cursor = 'crosshair'
          }
        }
        // If the ESC key is pressed
        if (e.code.includes('Esc')) finish(null)
      }

      function finish(bbox: [mapboxgl.PointLike, mapboxgl.PointLike] | null) {
        // Remove these events now that finish has been called.
        document.removeEventListener('mousemove', onMouseMove)
        // document.removeEventListener('keydown', onKeyDown)
        document.removeEventListener('mouseup', onMouseUp)
        canvas.style.cursor = 'grab'

        if (box) {
          box.parentNode?.removeChild(box)
          box = null
        }

        // If bbox exists. use this value as the argument for `queryRenderedFeatures`
        if (bbox) {
          const features = map.queryRenderedFeatures(bbox, {
            layers: ['media-points'],
          })
          // if (features.length >= 1000) {
          //   return window.alert('Select a smaller number of features')
          // }
          const filesStr = features
            .map(a => a.properties?.media_title)
            .join(',')
          console.log('file names: ' + filesStr)
          if (confirm('Show ' + features.length + ' files in file mamager?')) {
            location.href = 'ShowInFileManager:' + filesStr
            canvas.style.cursor = 'grab'
          }
        }

        map.dragPan.enable()
      }

      registerMediaMarkers({
        map: map,
        mapboxLibrary,
        dispatchMarkerMedia,
      })
    })
  }

export default MapPage
