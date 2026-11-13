/* Landing enrollment form → validation + cascading address dropdowns */
(function () {
  'use strict';
  if (!window.AbecApi) return;

  var NAME_ALLOWED_RE = /^[A-Za-zÑñ\s.\-']*$/;
  var NAME_INVALID_RE = /[0-9@#$%^&*+=\[\]{}|\\<>?/~`_!":;(),]/;
  var NAME_ERROR = 'Numbers and invalid special characters are not allowed. Use letters, spaces, and normal name punctuation.';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var NAME_FIELD_IDS = ['enroll-firstname', 'enroll-middlename', 'enroll-lastname', 'enroll-suffix'];

  var addressState = {
    province: '',
    city: '',
    barangay: '',
    street: '',
    district: '',
    region: '',
    zip: '',
    provinces: [],
    cities: [],       // currently shown city options
    allCities: [],    // all Bicol cities with provinceCode
    barangays: [],    // currently shown barangay options
    barangayCache: {}, // cityCode -> barangay options
    requestId: 0,
    cityRequestId: 0
  };

  function normalizeLocationOptions(raw, asBarangay, asCity) {
    if (!raw) return [];
    var list = Array.isArray(raw) ? raw : (raw.$values || raw.value || []);
    return list.map(function (item) {
      var name = repairMojibake(item.name || item.Name || '');
      if (asCity) name = formatCityName(name);
      if (asBarangay) name = formatBarangayName(name);
      return {
        code: item.code || item.Code || '',
        name: name
      };
    }).filter(function (item) {
      return item.code && item.name;
    });
  }

  /** Converts "City of Legazpi" → "Legazpi City". */
  function formatCityName(name) {
    name = repairMojibake(String(name || '').trim());
    var match = name.match(/^City of\s+(.+)$/i);
    if (!match) return name;
    var place = match[1].trim();
    if (!/ City$/i.test(place)) place += ' City';
    return place;
  }

  function formatBarangayName(name) {
    name = repairMojibake(String(name || '').trim());
    if (AbecApi.formatBarangay) return AbecApi.formatBarangay(name);
    if (!name) return name;
    if (/^Bgy\./i.test(name)) name = 'Brgy.' + name.slice(4);
    else if (/^Bgy\s/i.test(name)) name = 'Brgy. ' + name.slice(4);
    else if (/^Barangay\s/i.test(name)) name = 'Brgy. ' + name.slice(9);
    if (!/^Brgy\./i.test(name) && !/^Barangay\s/i.test(name)) {
      name = 'Brgy. ' + name;
    }
    return name;
  }

  /** Fixes UTF-8 mojibake such as CabagÃ±an → Cabañgan when present. */
  function repairMojibake(value) {
    if (!value || (value.indexOf('Ã') < 0 && value.indexOf('Â') < 0)) return value;
    try {
      var bytes = new Uint8Array(value.length);
      for (var i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i) & 0xff;
      var repaired = new TextDecoder('utf-8').decode(bytes);
      if (repaired.indexOf('\uFFFD') >= 0) return value;
      if (/[ñÑóéáíúüÓÉ]/i.test(repaired)) return repaired;
    } catch (e) { /* keep original */ }
    return value;
  }

  function psgcFileUrl(relativePath) {
    var base = (window.AbecApi && AbecApi.baseUrl) ? AbecApi.baseUrl : '';
    return base + '/data/psgc/' + relativePath;
  }

  function ensureNcrOption(options) {
    var list = options.slice();
    var hasNcr = list.some(function (item) { return item.code === '130000000'; });
    if (!hasNcr) {
      list.push({ code: '130000000', name: 'National Capital Region' });
    }
    list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    return list;
  }

  async function loadProvincesFallback() {
    try {
      var response = await fetch(psgcFileUrl('provinces.json'), { headers: { Accept: 'application/json' } });
      if (!response.ok) return [];
      var raw = await response.json();
      var list = Array.isArray(raw) ? raw : (raw.value || []);
      return ensureNcrOption(normalizeLocationOptions(list));
    } catch (e) {
      return [];
    }
  }

  async function loadCitiesFallback(provinceCode) {
    if (!provinceCode || provinceCode === '130000000') return [];
    try {
      var response = await fetch(psgcFileUrl('cities/' + encodeURIComponent(provinceCode) + '.json'), {
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) return [];
      var raw = await response.json();
      var list = Array.isArray(raw) ? raw : (raw.value || []);
      var options = normalizeLocationOptions(list, false, true);
      options.sort(function (a, b) { return a.name.localeCompare(b.name); });
      return options;
    } catch (e) {
      return [];
    }
  }

  async function loadBarangaysFallback(cityCode) {
    if (!cityCode) return [];
    try {
      var response = await fetch(psgcFileUrl('barangays/' + encodeURIComponent(cityCode) + '.json'), {
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) return [];
      var raw = await response.json();
      var list = Array.isArray(raw) ? raw : (raw.value || []);
      var options = normalizeLocationOptions(list, true);
      options.sort(function (a, b) { return a.name.localeCompare(b.name); });
      return options;
    } catch (e) {
      return [];
    }
  }

  function setError(inputId, errorId, message) {
    var input = document.getElementById(inputId);
    var error = document.getElementById(errorId);
    if (input) input.classList.toggle('enroll-input-error', !!message);
    if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
    window.AbecFeedback.inline(error, message, 'error');
  }

  function clearErrors() {
    NAME_FIELD_IDS.concat([
      'enroll-email', 'enroll-contact', 'enroll-gender', 'enroll-birthdate', 'enroll-age', 'enroll-course',
      'enroll-province', 'enroll-city', 'enroll-barangay', 'enroll-street'
    ]).forEach(function (id) {
      setError(id, id + '-error', '');
    });
    var addressError = document.getElementById('enroll-address-error');
    if (addressError) {
      addressError.textContent = '';
      addressError.classList.remove('is-visible');
    }
  }

  function validateGender(value) {
    if (!String(value || '').trim()) return 'Please select your gender.';
    return '';
  }

  function calculateAgeFromBirthdate(value) {
    if (!String(value || '').trim()) return null;
    var d = new Date(value + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d > today) return null;
    var age = today.getFullYear() - d.getFullYear();
    var m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
    return age;
  }

  function validateBirthdate(value) {
    if (!String(value || '').trim()) return 'Please enter your date of birth.';
    var d = new Date(value + 'T00:00:00');
    if (isNaN(d.getTime())) return 'Please enter a valid date of birth.';
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d > today) return 'Date of birth cannot be in the future.';
    var age = calculateAgeFromBirthdate(value);
    if (age == null) return 'Please enter a valid date of birth.';
    if (age < 18) return 'You must be at least 18 years old to register.';
    if (age > 100) return 'Please enter a valid date of birth.';
    return '';
  }

  function validateAge(ageValue, birthdateValue) {
    var raw = String(ageValue == null ? '' : ageValue).trim();
    if (!raw) return 'Please enter your age.';
    if (!/^\d+$/.test(raw)) return 'Please enter a valid age using numbers only.';
    var entered = parseInt(raw, 10);
    if (isNaN(entered) || entered < 1 || entered > 100) return 'Please enter a valid age.';
    if (entered < 18) return 'You must be at least 18 years old to register.';

    var birthdateErr = validateBirthdate(birthdateValue);
    if (birthdateErr) return ''; // birthdate field will show its own message

    var expected = calculateAgeFromBirthdate(birthdateValue);
    if (expected == null) return 'Please enter a valid date of birth first.';
    if (entered !== expected) return 'The age you entered does not match your date of birth.';
    return '';
  }

  function validateNamePart(value, required) {
    var trimmed = String(value || '').trim();
    if (!trimmed) return required ? 'This field is required.' : '';
    if (NAME_INVALID_RE.test(trimmed) || !NAME_ALLOWED_RE.test(trimmed)) return NAME_ERROR;
    return '';
  }

  function toTitleCaseName(value) {
    var particles = { de: 1, del: 1, dela: 1, la: 1, y: 1, van: 1, von: 1, da: 1, das: 1, dos: 1, di: 1 };
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean)
      .map(function (word, index) {
        return word.split('-').map(function (part) {
          var lower = part.toLocaleLowerCase('en-US');
          if (index > 0 && particles[lower]) return lower;
          if (lower.indexOf('mc') === 0 && lower.length > 2) {
            return 'Mc' + lower.charAt(2).toLocaleUpperCase('en-US') + lower.slice(3);
          }
          if (lower.indexOf('mac') === 0 && lower.length > 3) {
            return 'Mac' + lower.charAt(3).toLocaleUpperCase('en-US') + lower.slice(4);
          }
          return part.charAt(0).toLocaleUpperCase('en-US') + part.slice(1).toLocaleLowerCase('en-US');
        }).join('-');
      })
      .join(' ');
  }

  function wireNameField(inputId, required) {
    var input = document.getElementById(inputId);
    if (!input) return;

    input.addEventListener('input', function () {
      var value = input.value;
      if (!value) {
        setError(inputId, inputId + '-error', '');
        return;
      }
      setError(inputId, inputId + '-error', validateNamePart(value, required));
    });

    input.addEventListener('blur', function () {
      input.value = toTitleCaseName(input.value);
      setError(inputId, inputId + '-error', validateNamePart(input.value, required));
    });
  }

  function validateEmail(value) {
    var email = String(value || '').trim();
    if (!email) return 'Please enter your email address.';
    if (!EMAIL_RE.test(email)) return 'Please enter a valid email address.';
    return '';
  }

  function isContactPrefixOnly(value) {
    var v = String(value || '').trim();
    return !v || v === '+' || v === '+6' || v === '+63';
  }

  function syncContactPrefixStyle(input) {
    if (!input) return;
    input.classList.toggle('is-prefix-only', isContactPrefixOnly(input.value));
  }

  /** Keeps +63 only as the empty-state prefix; strips it once the user types a number. */
  function formatContact(value) {
    var raw = String(value || '').trim();
    if (isContactPrefixOnly(raw)) return '+63';

    var digits = raw.replace(/\D/g, '');

    // Remove country code so "+63" is never kept/duplicated in the typed value.
    if (digits.indexOf('63') === 0 && digits.length > 2) {
      var rest = digits.slice(2);
      if (!rest || rest.charAt(0) === '9' || rest.charAt(0) === '0') {
        digits = rest;
      }
    }

    if (!digits) return '+63';

    // Local mobile entry: 09XXXXXXXXX (11) or 9XXXXXXXXX (10)
    if (digits.charAt(0) === '0') return digits.slice(0, 11);
    if (digits.charAt(0) === '9') return digits.slice(0, 10);
    return digits.slice(0, 11);
  }

  function toApiContact(value) {
    var local = formatContact(value);
    if (isContactPrefixOnly(local)) return '';
    var digits = String(local).replace(/\D/g, '');
    if (/^09\d{9}$/.test(digits)) return '+63' + digits.slice(1);
    if (/^9\d{9}$/.test(digits)) return '+63' + digits;
    return local;
  }

  function validateContact(value) {
    var formatted = formatContact(value);
    if (isContactPrefixOnly(formatted)) {
      return 'Please enter your mobile number.';
    }
    var digits = String(formatted).replace(/\D/g, '');
    if (!/^(09\d{9}|9\d{9})$/.test(digits)) {
      return 'Enter a valid mobile number (example: 09171234567). Letters are not allowed.';
    }
    return '';
  }

  function fillSelect(selectEl, options, placeholder, selectedCode) {
    if (!selectEl) return;
    selectEl.replaceChildren();
    var prompt = document.createElement('option');
    prompt.value = '';
    prompt.textContent = placeholder;
    prompt.disabled = true;
    prompt.selected = !selectedCode;
    selectEl.appendChild(prompt);
    options.forEach(function (item) {
      var option = document.createElement('option');
      option.value = String(item.code);
      option.textContent = String(item.name);
      option.selected = !!selectedCode && item.code === selectedCode;
      selectEl.appendChild(option);
    });
  }

  function findOptionByCode(list, code) {
    if (!code) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].code === code) return list[i];
    }
    return null;
  }

  function setAddressSelectEnabled(select, enabled) {
    if (!select) return;
    select.disabled = !enabled;
    select.setAttribute('aria-busy', 'false');
  }

  function showAddressLoading(select, label) {
    if (!select) return;
    select.disabled = true;
    select.setAttribute('aria-busy', 'true');
    fillSelect(select, [], label, null);
  }

  async function fetchCitiesForProvince(provinceCode) {
    var result = await AbecApi.get('/api/locations/provinces/' + encodeURIComponent(provinceCode) + '/cities');
    var options = normalizeLocationOptions(result.data, false, true);
    if (!result.success || !options.length) {
      options = await loadCitiesFallback(provinceCode);
    }
    return options.map(function (item) {
      return {
        code: item.code,
        name: item.name,
        provinceCode: provinceCode
      };
    });
  }

  async function fetchBarangaysForCity(cityCode) {
    if (addressState.barangayCache[cityCode]) {
      return addressState.barangayCache[cityCode];
    }
    var result = await AbecApi.get('/api/locations/cities/' + encodeURIComponent(cityCode) + '/barangays');
    var options = normalizeLocationOptions(result.data, true);
    if (!result.success || !options.length) {
      options = await loadBarangaysFallback(cityCode);
    }
    var mapped = options.map(function (item) {
      return {
        code: item.code,
        name: item.name,
        cityCode: cityCode
      };
    });
    if (mapped.length) addressState.barangayCache[cityCode] = mapped;
    return mapped;
  }

  async function loadCitiesForSelectedProvince(keepSelection) {
    var citySelect = document.getElementById('enroll-city');
    var barangaySelect = document.getElementById('enroll-barangay');
    var province = addressState.province;
    var requestId = ++addressState.cityRequestId;
    var keepCityCode = keepSelection && addressState.city ? addressState.city.code : null;

    if (!keepSelection) {
      addressState.city = null;
      addressState.barangay = null;
      addressState.barangays = [];
    }

    fillSelect(barangaySelect, [], 'Select Barangay', null);
    setAddressSelectEnabled(barangaySelect, false);

    if (!province) {
      addressState.cities = [];
      fillSelect(citySelect, [], 'Select City / Municipality', null);
      setAddressSelectEnabled(citySelect, false);
      return;
    }

    showAddressLoading(citySelect, 'Loading cities...');
    setError('enroll-city', 'enroll-city-error', '');

    var options = [];
    try {
      options = await fetchCitiesForProvince(province.code);
    } catch (e) {
      options = [];
    }
    if (requestId !== addressState.cityRequestId) return;

    options.sort(function (a, b) { return a.name.localeCompare(b.name); });
    addressState.cities = options;
    var selected = keepCityCode ? findOptionByCode(options, keepCityCode) : null;
    addressState.city = selected;
    if (!selected) {
      addressState.barangay = null;
      addressState.barangays = [];
    }
    fillSelect(citySelect, options, 'Select City / Municipality', selected ? selected.code : null);
    setAddressSelectEnabled(citySelect, true);
    if (!options.length) {
      setError('enroll-city', 'enroll-city-error', 'Unable to load cities and municipalities for this province. Please try again.');
      return;
    }
    if (selected && keepSelection) {
      await loadBarangaysForSelectedCity(true);
    }
  }

  async function loadBarangaysForSelectedCity(keepSelection) {
    var barangaySelect = document.getElementById('enroll-barangay');
    var city = addressState.city;
    var requestId = ++addressState.requestId;
    var keepBarangayCode = keepSelection && addressState.barangay ? addressState.barangay.code : null;

    if (!city) {
      addressState.barangays = [];
      addressState.barangay = null;
      fillSelect(barangaySelect, [], 'Select Barangay', null);
      setAddressSelectEnabled(barangaySelect, false);
      return;
    }

    showAddressLoading(barangaySelect, 'Loading barangays...');
    setError('enroll-barangay', 'enroll-barangay-error', '');

    var options = [];
    try {
      options = await fetchBarangaysForCity(city.code);
    } catch (e) {
      options = [];
    }
    if (requestId !== addressState.requestId) return;

    options.sort(function (a, b) { return a.name.localeCompare(b.name); });
    addressState.barangays = options;
    var selected = keepBarangayCode ? findOptionByCode(options, keepBarangayCode) : null;
    addressState.barangay = selected;
    fillSelect(barangaySelect, options, 'Select Barangay', selected ? selected.code : null);
    setAddressSelectEnabled(barangaySelect, true);
    if (!options.length) {
      setError('enroll-barangay', 'enroll-barangay-error', 'Unable to load barangays for this city or municipality. Please try again.');
    }
  }

  async function loadProvinces() {
    var select = document.getElementById('enroll-province');
    var citySelect = document.getElementById('enroll-city');
    var barangaySelect = document.getElementById('enroll-barangay');
    if (!select) return;

    showAddressLoading(select, 'Loading provinces...');
    fillSelect(citySelect, [], 'Select City / Municipality', null);
    fillSelect(barangaySelect, [], 'Select Barangay', null);
    setAddressSelectEnabled(citySelect, false);
    setAddressSelectEnabled(barangaySelect, false);

    var options = [];
    try {
      var result = await AbecApi.get('/api/locations/provinces');
      options = normalizeLocationOptions(result.data);
      if (!result.success || !options.length) options = await loadProvincesFallback();
    } catch (e) {
      options = await loadProvincesFallback();
    }
    options = ensureNcrOption(options);
    addressState.provinces = options;

    var selected = addressState.province ? findOptionByCode(options, addressState.province.code) : null;
    addressState.province = selected;
    fillSelect(select, options, 'Select Province', selected ? selected.code : null);
    setAddressSelectEnabled(select, true);

    if (!options.length) {
      setError('enroll-province', 'enroll-province-error', 'Unable to load provinces. Please check your connection and try again.');
      return;
    }
    setError('enroll-province', 'enroll-province-error', '');
    if (selected) await loadCitiesForSelectedProvince(true);
  }

  function addressValue(value) {
    if (value && typeof value === 'object') return String(value.name || '').trim();
    return String(value == null ? '' : value).trim();
  }

  function readAddressInputs() {
    var province = document.getElementById('enroll-province');
    var city = document.getElementById('enroll-city');
    var barangay = document.getElementById('enroll-barangay');
    var street = document.getElementById('enroll-street');
    if (province) addressState.province = province.value;
    if (city) addressState.city = city.value;
    if (barangay) addressState.barangay = barangay.value;
    if (street) addressState.street = street.value;
    var district = document.getElementById('enroll-district');
    var region = document.getElementById('enroll-region');
    var zip = document.getElementById('enroll-zip');
    if (district) addressState.district = district.value;
    if (region) addressState.region = region.value;
    if (zip) addressState.zip = zip.value;
  }

  function bindAddressInput(id, key) {
    var input = document.getElementById(id);
    if (!input) return;
    input.disabled = false;
    input.readOnly = false;
    input.addEventListener('input', function () {
      addressState[key] = input.value;
      if (addressValue(input.value)) setError(id, id + '-error', '');
    });
    input.addEventListener('blur', function () {
      var trimmed = addressValue(input.value);
      input.value = trimmed;
      addressState[key] = trimmed;
    });
  }

  function resetAddressFields() {
    addressState.province = '';
    addressState.city = '';
    addressState.barangay = '';
    addressState.street = '';
    addressState.district = '';
    addressState.region = '';
    addressState.zip = '';

    ['enroll-province', 'enroll-city', 'enroll-barangay', 'enroll-street', 'enroll-district', 'enroll-zip'].forEach(function (id) {
      var input = document.getElementById(id);
      if (input) {
        input.value = '';
        input.disabled = false;
        input.readOnly = false;
      }
      setError(id, id + '-error', '');
    });
  }

  function wireAddressFields() {
    var barangayInput = document.getElementById('enroll-barangay');
    if (barangayInput) barangayInput.addEventListener('input', function () {
      barangayInput.value = barangayInput.value.replace(/^\s*(?:(?:barangay|brgy|bgy)(?:\.\s*|\s+|$))+/i, '');
      addressState.barangay = barangayInput.value;
    });
    bindAddressInput('enroll-province', 'province');
    bindAddressInput('enroll-city', 'city');
    bindAddressInput('enroll-barangay', 'barangay');
    bindAddressInput('enroll-street', 'street');
    bindAddressInput('enroll-district', 'district');
    bindAddressInput('enroll-zip', 'zip');
    // Free-text locations have no authoritative ZIP data. Reconfirm on changes.
    ['enroll-province', 'enroll-city', 'enroll-region'].forEach(function (id) {
      var input = document.getElementById(id);
      if (input) input.addEventListener('change', function () {
        var zip = document.getElementById('enroll-zip');
        if (zip) zip.value = '';
        addressState.zip = '';
      });
    });
    var region = document.getElementById('enroll-region');
    if (region) {
      region.addEventListener('change', function () {
        addressState.region = region.value;
        if (region.value) setError('enroll-region', 'enroll-region-error', '');
      });
    }
  }

  function syncAddressUiFromState() {
    var fields = [
      ['enroll-province', 'province'],
      ['enroll-city', 'city'],
      ['enroll-barangay', 'barangay'],
      ['enroll-street', 'street'],
      ['enroll-district', 'district'],
      ['enroll-zip', 'zip']
    ];
    fields.forEach(function (pair) {
      var input = document.getElementById(pair[0]);
      if (!input || document.activeElement === input) return;
      var na = document.querySelector('[data-na-for="' + pair[0] + '"]');
      if (na && na.checked) {
        input.value = 'N/A';
        input.readOnly = true;
        addressState[pair[1]] = 'N/A';
        return;
      }
      input.disabled = false;
      input.readOnly = false;
      input.value = addressValue(addressState[pair[1]]);
    });
    var regionInput = document.getElementById('enroll-region');
    if (regionInput && document.activeElement !== regionInput) regionInput.value = addressValue(addressState.region);
  }
  function validateAddressFields() {
    readAddressInputs();
    if (!addressValue(addressState.province)) return 'Please enter your province.';
    if (!addressValue(addressState.city)) return 'Please enter your city or municipality.';
    if (!addressValue(addressState.barangay)) return 'Please enter your barangay.';
    if (!addressValue(addressState.street)) return 'Please enter your purok, street, or house number.';
    return '';
  }

  function buildFullAddress() {
    readAddressInputs();
    var parts = [
      addressValue(addressState.street),
      AbecApi.formatBarangay ? AbecApi.formatBarangay(addressValue(addressState.barangay)) : addressValue(addressState.barangay),
      addressValue(addressState.district),
      addressValue(addressState.city),
      addressValue(addressState.province),
      addressValue(addressState.region),
      addressValue(addressState.zip)
    ].filter(Boolean);
    return parts.join(', ');
  }

  function getSelectedCourseName() {
    var el = document.getElementById('enroll-course');
    if (!el) return '';
    var option = el.options[el.selectedIndex];
    var label = option ? String(option.text || '').trim() : '';
    if (!el.value || label === 'Select a course') return '';
    return label || String(el.value || '').trim();
  }

  function validateCourseSelection() {
    return getSelectedCourseName() ? '' : 'Please select a course.';
  }

  function resetForm(form) {
    form.reset();
    var contact = document.getElementById('enroll-contact');
    if (contact) {
      contact.value = '+63';
      syncContactPrefixStyle(contact);
    }
    resetAddressFields();
    clearErrors();
  }

  window.resetEnrollRegistrationForm = function () {
    var form = document.querySelector('#enroll-step-form form');
    if (form) resetForm(form);
  };

  function initLandingEnrollment() {
    var form = document.querySelector('#enroll-step-form form');
    if (!form) return;

    var firstNameInput = document.getElementById('enroll-firstname');
    var middleNameInput = document.getElementById('enroll-middlename');
    var lastNameInput = document.getElementById('enroll-lastname');
    var suffixInput = document.getElementById('enroll-suffix');
    var emailInput = document.getElementById('enroll-email');
    var contactInput = document.getElementById('enroll-contact');
    var genderInput = document.getElementById('enroll-gender');
    var birthdateInput = document.getElementById('enroll-birthdate');

    wireNameField('enroll-firstname', true);
    wireNameField('enroll-middlename', false);
    wireNameField('enroll-lastname', true);
    wireNameField('enroll-suffix', false);
    wireAddressFields();

    if (birthdateInput) {
      var today = new Date();
      // Max selectable DOB = 18th birthday today (must be at least 18).
      var maxAdult = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
      var min = new Date(today.getFullYear() - 100, today.getMonth(), today.getDate());
      birthdateInput.setAttribute('max', maxAdult.toISOString().slice(0, 10));
      birthdateInput.setAttribute('min', min.toISOString().slice(0, 10));
      function syncBirthdateValidation() {
        var value = birthdateInput.value;
        // Empty DOB: keep the field clean — required/age messages only on submit.
        if (!String(value || '').trim()) {
          setError('enroll-birthdate', 'enroll-birthdate-error', '');
          var emptyAge = document.getElementById('enroll-age');
          if (emptyAge) emptyAge.value = '';
          var emptyDisplay = document.getElementById('enroll-birthdate-display');
          if (emptyDisplay) emptyDisplay.textContent = '';
          return;
        }
        setError('enroll-birthdate', 'enroll-birthdate-error', validateBirthdate(value));
        var ageInput = document.getElementById('enroll-age');
        var calculated = calculateAgeFromBirthdate(value);
        if (ageInput) ageInput.value = calculated == null ? '' : String(calculated);
        var display = document.getElementById('enroll-birthdate-display');
        if (display) {
          var parts = String(value).split('-');
          display.textContent = parts.length === 3 ? (parts[1] + '/' + parts[2] + '/' + parts[0]) : '';
        }
        if (ageInput) setError('enroll-age', 'enroll-age-error', validateAge(ageInput.value, value));
      }
      birthdateInput.addEventListener('change', syncBirthdateValidation);
      birthdateInput.addEventListener('input', syncBirthdateValidation);
      setError('enroll-birthdate', 'enroll-birthdate-error', '');
      setError('enroll-age', 'enroll-age-error', '');
    }

    var ageInput = document.getElementById('enroll-age');
    if (ageInput) {
      ageInput.addEventListener('input', function () {
        var digits = String(ageInput.value || '').replace(/\D/g, '');
        if (ageInput.value !== digits) ageInput.value = digits;
        // Live feedback only when both fields have values — never overwrite age.
        var birthdateInput = document.getElementById('enroll-birthdate');
        var dob = birthdateInput ? birthdateInput.value : '';
        if (!String(ageInput.value || '').trim()) {
          setError('enroll-age', 'enroll-age-error', '');
          return;
        }
        if (String(dob || '').trim()) {
          setError('enroll-age', 'enroll-age-error', validateAge(ageInput.value, dob));
        } else {
          var entered = parseInt(ageInput.value, 10);
          setError('enroll-age', 'enroll-age-error',
            (!isNaN(entered) && entered < 18) ? 'You must be at least 18 years old to register.' : '');
        }
      });
    }

    if (genderInput) {
      genderInput.addEventListener('change', function () {
        setError('enroll-gender', 'enroll-gender-error', validateGender(genderInput.value));
      });
    }

    var courseInput = document.getElementById('enroll-course');
    if (courseInput) {
      courseInput.addEventListener('change', function () {
        setError('enroll-course', 'enroll-course-error', validateCourseSelection());
      });
    }
    if (emailInput) {
      emailInput.addEventListener('blur', function () {
        setError('enroll-email', 'enroll-email-error', validateEmail(emailInput.value));
      });
      emailInput.addEventListener('input', function () {
        if (!emailInput.value.trim()) {
          setError('enroll-email', 'enroll-email-error', '');
          return;
        }
        setError('enroll-email', 'enroll-email-error', validateEmail(emailInput.value));
      });
    }

    if (contactInput) {
      var contactTypingError = '';
      function clearContactError() {
        window.AbecFeedback.dismissInline(document.getElementById('enroll-contact-error'));
        setError('enroll-contact', 'enroll-contact-error', '');
      }

      form.addEventListener('reset', function () {
        contactTypingError = '';
        clearContactError();
      });

      if (!contactInput.value) contactInput.value = '+63';
      syncContactPrefixStyle(contactInput);

      contactInput.addEventListener('focus', function () {
        clearContactError();
        if (isContactPrefixOnly(contactInput.value)) {
          contactInput.value = '+63';
          syncContactPrefixStyle(contactInput);
          try { contactInput.setSelectionRange(contactInput.value.length, contactInput.value.length); } catch (e) { /* ignore */ }
          return;
        }
        contactInput.value = formatContact(contactInput.value);
        syncContactPrefixStyle(contactInput);
      });

      contactInput.addEventListener('input', function () {
        var before = contactInput.value;
        var next = formatContact(before);
        contactInput.value = next;
        syncContactPrefixStyle(contactInput);

        contactTypingError = /[A-Za-z]/.test(before) ? 'Numbers only. Letters are not allowed.' : '';
        clearContactError();
      });

      contactInput.addEventListener('keydown', function (e) {
        // When only +63 is shown, typing a digit replaces the prefix instead of appending to it.
        if (isContactPrefixOnly(contactInput.value) && e.key.length === 1 && /[0-9]/.test(e.key)) {
          e.preventDefault();
          contactInput.value = formatContact(e.key);
          syncContactPrefixStyle(contactInput);
          contactTypingError = '';
          clearContactError();
          return;
        }
      });

      contactInput.addEventListener('blur', function () {
        var next = formatContact(contactInput.value);
        contactInput.value = next;
        syncContactPrefixStyle(contactInput);
        var error = validateContact(next);
        setError('enroll-contact', 'enroll-contact-error', error ? (contactTypingError || error) : '');
      });
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (window.AbecEnrollWizard && window.AbecEnrollWizard.usesWizardForm) return;
      clearErrors();

      var firstName = toTitleCaseName((firstNameInput && firstNameInput.value) || '');
      var middleName = toTitleCaseName((middleNameInput && middleNameInput.value) || '');
      var lastName = toTitleCaseName((lastNameInput && lastNameInput.value) || '');
      var suffix = toTitleCaseName((suffixInput && suffixInput.value) || '');
      if (firstNameInput) firstNameInput.value = firstName;
      if (middleNameInput) middleNameInput.value = middleName;
      if (lastNameInput) lastNameInput.value = lastName;
      if (suffixInput) suffixInput.value = suffix;

      var streetInput = document.getElementById('enroll-street');
      addressState.street = streetInput ? String(streetInput.value || '').trim() : '';
      readAddressInputs();

      var email = (emailInput && emailInput.value) || '';
      var courseName = getSelectedCourseName();
      var contact = toApiContact((contactInput && contactInput.value) || '');
      var gender = (genderInput && genderInput.value) || '';
      var birthdate = (birthdateInput && birthdateInput.value) || '';
      var ageInputEl = document.getElementById('enroll-age');
      var ageRaw = (ageInputEl && ageInputEl.value) || '';
      var address = buildFullAddress();

      var firstErr = validateNamePart(firstName, true);
      var middleErr = validateNamePart(middleName, false);
      var lastErr = validateNamePart(lastName, true);
      var suffixErr = validateNamePart(suffix, false);
      var genderErr = validateGender(gender);
      var birthdateErr = validateBirthdate(birthdate);
      var ageErr = validateAge(ageRaw, birthdate);
      var emailErr = validateEmail(email);
      var provinceErr = addressValue(addressState.province) ? '' : 'Please enter your province.';
      var cityErr = addressValue(addressState.city) ? '' : 'Please enter your city or municipality.';
      var barangayErr = addressValue(addressState.barangay) ? '' : 'Please enter your barangay.';
      var streetErr = addressValue(addressState.street)
        ? ''
        : 'Please enter your purok, street, or house number.';
      var contactErr = validateContact((contactInput && contactInput.value) || '');
      var courseErr = validateCourseSelection();

      setError('enroll-firstname', 'enroll-firstname-error', firstErr);
      setError('enroll-middlename', 'enroll-middlename-error', middleErr);
      setError('enroll-lastname', 'enroll-lastname-error', lastErr);
      setError('enroll-suffix', 'enroll-suffix-error', suffixErr);
      setError('enroll-gender', 'enroll-gender-error', genderErr);
      setError('enroll-birthdate', 'enroll-birthdate-error', birthdateErr);
      setError('enroll-age', 'enroll-age-error', ageErr);
      setError('enroll-email', 'enroll-email-error', emailErr);
      setError('enroll-province', 'enroll-province-error', provinceErr);
      setError('enroll-city', 'enroll-city-error', cityErr);
      setError('enroll-barangay', 'enroll-barangay-error', barangayErr);
      setError('enroll-street', 'enroll-street-error', streetErr);
      setError('enroll-contact', 'enroll-contact-error', contactErr);
      setError('enroll-course', 'enroll-course-error', courseErr);

      if (firstErr || middleErr || lastErr || suffixErr || genderErr || birthdateErr || ageErr || emailErr ||
          provinceErr || cityErr || barangayErr || streetErr || contactErr || courseErr) {
        return;
      }

      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
      }

      var result = await AbecApi.post('/api/applicants/enroll', {
        firstName: firstName,
        middleName: middleName || null,
        lastName: lastName,
        suffix: suffix || null,
        gender: gender,
        birthdate: birthdate,
        age: parseInt(ageRaw, 10),
        email: email.trim(),
        province: addressValue(addressState.province),
        cityMunicipality: addressValue(addressState.city),
        barangay: addressValue(addressState.barangay),
        streetDetails: addressValue(addressState.street),
        address: address,
        courseName: courseName.trim(),
        contactNumber: contact
      });

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
      }

      if (!result.success) {
        alert(result.message || 'Unable to submit application.');
        return;
      }

      alert(result.message || 'Application submitted successfully. Status is Pending.');
      resetForm(form);
      if (typeof showEnrollStep === 'function') showEnrollStep('intro');
      if (typeof closeEnrollModal === 'function') closeEnrollModal();
    });
  }

  function courseDetailKey(courseName) {
    var name = String(courseName || '').replace(/\s*NC\s*[IVX]+\b/gi, '').trim().toLowerCase();
    if (name === 'bookkeeping') return 'bookkeeping';
    if (/^customer services?$/.test(name)) return 'customer';
    if (/^electronic products? assembly and servicing$/.test(name)) return 'electronic';
    if (/^computer systems? servicing$/.test(name)) return 'computer';
    return '';
  }

  function setCourseDetail(key, field, text) {
    var el = document.querySelector('[data-course-' + field + '="' + key + '"]');
    if (!el || !text) return;
    el.textContent = text;
    el.classList.remove('course-detail-pending');
  }

  function syncPublicCourseCards() {
    AbecApi.get('/api/courses').then(function (result) {
      var rows = (result && (result.data || result.Data)) || [];
      if (!Array.isArray(rows)) return;
      rows.forEach(function (course) {
        var key = courseDetailKey(course.courseName || course.CourseName);
        if (!key) {
          var grid = document.querySelector('#courses .grid');
          if (!grid || grid.querySelector('[data-public-course-id="' + Number(course.courseId) + '"]')) return;
          var card = document.createElement('article');
          card.className = 'abec-card abec-new-public-course';
          card.setAttribute('data-public-course-id', String(course.courseId));
          var title = document.createElement('h3'); title.textContent = course.courseName;
          var description = document.createElement('p'); description.textContent = course.courseDescription || '';
          var duration = document.createElement('p'); duration.textContent = course.programSummary || course.duration;
          var hours = document.createElement('p'); hours.textContent = course.totalHours + ' total training hours';
          card.appendChild(title); card.appendChild(description); card.appendChild(duration); card.appendChild(hours);
          grid.appendChild(card);
          return;
        }
        var detail = document.getElementById('course-detail-' + key);
        var existingCard = detail && detail.closest('.course-card');
        if (existingCard) existingCard.querySelectorAll('h3').forEach(function (heading) {
          heading.textContent = course.courseName || course.CourseName;
        });
        var total = Number(course.totalHours || course.TotalHours || 0);
        var days = Number(course.trainingDays || course.TrainingDays || 0);
        var ojt = Number(course.ojtDays || course.OjtDays || 0);
        var description = String(course.courseDescription || course.CourseDescription || '').trim();
        if (description) setCourseDetail(key, 'description', description);
        if (days > 0 || ojt > 0) {
          var duration = ojt > 0
            ? days + ' training days + ' + ojt + ' on-the-job training days'
            : days + (days === 1 ? ' day' : ' days');
          setCourseDetail(key, 'duration', duration);
        }
        if (total > 0) setCourseDetail(key, 'total', total + (total === 1 ? ' hour' : ' hours'));
      });
    }).catch(function () { });
  }

  function initCourseDetails() {
    var section = document.getElementById('courses');
    if (!section || section.getAttribute('data-details-ready') === '1') return;
    section.setAttribute('data-details-ready', '1');
    var compactPeek = 168;
    var openLayer = 6;

    function measureCard(card) {
      var surface = card.querySelector('.course-card-surface');
      var body = card.querySelector('.course-card-body');
      var details = card.querySelector('.course-card-details');
      if (!surface || !body || !details) return;
      var closed = compactPeek + Math.ceil(body.getBoundingClientRect().height);
      var content = Math.ceil(details.scrollHeight);
      card._closedHeight = closed;
      card._openHeight = Math.max(closed, content);
      card.style.height = closed + 'px';
      surface.style.height = (card.classList.contains('is-open') ? card._openHeight : closed) + 'px';
    }

    function setOrigin(card) {
      var surface = card.querySelector('.course-card-surface');
      var button = card.querySelector('.course-details-btn');
      if (!surface || !button) return;
      var surfaceBox = surface.getBoundingClientRect();
      var buttonBox = button.getBoundingClientRect();
      var x = buttonBox.left + buttonBox.width / 2 - surfaceBox.left;
      var y = buttonBox.top + buttonBox.height / 2 - surfaceBox.top;
      surface.style.setProperty('--origin-x', Math.round(x) + 'px');
      surface.style.setProperty('--origin-y', Math.round(y) + 'px');
    }

    function canHover() {
      return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    }

    function setCourseOpen(card, open) {
      var button = card.querySelector('.course-details-btn');
      var details = card.querySelector('.course-card-details');
      var heading = card.querySelector('.course-card-body h3');
      var surface = card.querySelector('.course-card-surface');
      if (open) setOrigin(card);
      card.classList.toggle('is-open', open);
      if (button) button.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (details) details.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (heading) heading.setAttribute('aria-hidden', open ? 'true' : 'false');
      if (open) card.style.zIndex = String(++openLayer);
      else card.style.zIndex = '';
      if (surface) surface.style.height = (open ? card._openHeight : card._closedHeight) + 'px';
    }

    function clearOutsideWatch(card) {
      if (!card._outsideWatch) return;
      document.removeEventListener('mousemove', card._outsideWatch);
      card._outsideWatch = null;
    }

    function scheduleClose(card) {
      if (card._closeTimer) window.clearTimeout(card._closeTimer);
      card._closeTimer = window.setTimeout(function () {
        card._closeTimer = null;
        if (!card.classList.contains('is-open') || card.matches(':hover')) return;
        clearOutsideWatch(card);
        setCourseOpen(card, false);
      }, 140);
    }

    function watchOutside(card) {
      clearOutsideWatch(card);
      function watch(event) {
        if (card.contains(event.target)) return;
        clearOutsideWatch(card);
        scheduleClose(card);
      }
      card._outsideWatch = watch;
      document.addEventListener('mousemove', watch);
    }

    section.querySelectorAll('.course-card').forEach(function (card) {
      measureCard(card);

      card.addEventListener('mouseenter', function () {
        clearOutsideWatch(card);
        if (card._closeTimer) {
          window.clearTimeout(card._closeTimer);
          card._closeTimer = null;
        }
        if (card.classList.contains('is-open')) card._holdLeave = false;
      });

      card.addEventListener('mouseleave', function () {
        if (!canHover() || card._holdLeave || !card.classList.contains('is-open')) return;
        scheduleClose(card);
      });
    });
    window.requestAnimationFrame(function () {
      section.classList.add('is-ready');
    });

    section.addEventListener('click', function (event) {
      var opener = event.target.closest('[data-course-open]');
      if (!opener || !section.contains(opener)) return;
      var card = opener.closest('.course-card');
      if (!card) return;
      event.preventDefault();
      if (!canHover()) {
        setCourseOpen(card, !card.classList.contains('is-open'));
        return;
      }
      if (card.classList.contains('is-open')) return;
      card._holdLeave = true;
      setCourseOpen(card, true);
      window.setTimeout(function () {
        card._holdLeave = false;
        if (card.classList.contains('is-open') && !card.matches(':hover')) watchOutside(card);
      }, 780);
    });

    window.addEventListener('resize', function () {
      section.querySelectorAll('.course-card').forEach(measureCard);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () {
    initLandingEnrollment();
    syncPublicCourseCards();
    initCourseDetails();
  });
  else {
    initLandingEnrollment();
    syncPublicCourseCards();
    initCourseDetails();
  }

  window.AbecEnrollShared = {
    addressState: addressState,
    addressValue: addressValue,
    readAddressInputs: readAddressInputs,
    buildFullAddress: buildFullAddress,
    validateGender: validateGender,
    validateBirthdate: validateBirthdate,
    validateAge: validateAge,
    validateNamePart: validateNamePart,
    validateEmail: validateEmail,
    validateContact: validateContact,
    toApiContact: toApiContact,
    validateAddressFields: validateAddressFields,
    resetForm: resetForm,
    setError: setError,
    clearErrors: clearErrors,
    toTitleCaseName: toTitleCaseName,
    getSelectedCourseName: getSelectedCourseName,
    validateCourseSelection: validateCourseSelection,
    syncAddressUiFromState: syncAddressUiFromState
  };
})();
