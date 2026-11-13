(function () {
  'use strict';
  var el = document.getElementById('abec-contact-map');
  var status = document.getElementById('abec-map-status');
  if (!el || el.getAttribute('data-ready') === '1') return;
  function unavailable() {
    if (status) {
      status.textContent = 'The map is unavailable. Use Get Directions or the address below to find ABEC.';
      status.hidden = false;
    }
  }
  if (!window.L) { unavailable(); return; }
  el.setAttribute('data-ready', '1');
  var lat = 13.1472258, lon = 123.7538898;
  var address = '3F PVLB Building, Pe\u00f1aranda St., Legazpi City, Albay, Philippines';
  var map = L.map(el, { scrollWheelZoom: false }).setView([lat, lon], 16);
  var currentLayer, fallback = false, loaded = false;
  var timer;
  function showTiles(useFallback) {
    fallback = useFallback;
    loaded = false;
    if (currentLayer) { currentLayer.off(); map.removeLayer(currentLayer); }
    currentLayer = L.tileLayer(useFallback
      ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
      : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: useFallback ? 20 : 19,
      subdomains: 'abcd',
      // OSM requires a Referer. Override only public map image requests; never
      // relax no-referrer on emailed bearer-link pages or expose their tokens.
      referrerPolicy: 'strict-origin-when-cross-origin',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' + (useFallback ? ' &copy; <a href="https://carto.com/attributions">CARTO</a>' : '')
    });
    var layer = currentLayer;
    layer.on('tileload', function () {
      if (layer !== currentLayer) return;
      loaded = true;
      clearTimeout(timer);
      if (status) status.hidden = true;
    });
    layer.on('tileerror', function () {
      if (layer !== currentLayer) return;
      if (!fallback && !loaded) showTiles(true);
      else if (!loaded) unavailable();
    });
    clearTimeout(timer);
    timer = setTimeout(function () {
      if (layer !== currentLayer || loaded) return;
      if (!fallback) showTiles(true); else unavailable();
    }, 8000);
    layer.addTo(map);
  }
  showTiles(false);
  var icon = L.divIcon({
    className: 'abec-pin-wrap',
    html: '<div class="abec-pin"><span class="abec-pin-label">ABEC</span><svg width="28" height="40" viewBox="0 0 28 40" aria-hidden="true"><path d="M14 0C6.3 0 0 6.2 0 13.8 0 24 14 40 14 40s14-16 14-26.2C28 6.2 21.7 0 14 0z" fill="#2563EB"/><circle cx="14" cy="14" r="5.5" fill="#fff"/></svg></div>',
    iconSize: [56, 62], iconAnchor: [28, 62], popupAnchor: [0, -56]
  });
  L.marker([lat, lon], { icon: icon, title: 'ABEC Institute approximate street location', alt: 'ABEC Institute approximate street location' }).addTo(map)
    .bindPopup('<strong>ABEC Institute of Business and Technology Inc</strong><br>' + address + '<br><span style="color:#4b5563">Approximate street location. Use Get Directions for the building address.</span>', { maxWidth: 250 });
  function fit() { map.invalidateSize({ pan: false }); }
  window.addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(el);
  setTimeout(fit, 200);
})();
