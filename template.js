const encodeUriComponent = require('encodeUriComponent');
const generateRandom = require('generateRandom');
const getAllEventData = require('getAllEventData');
const getCookieValues = require('getCookieValues');
const getRequestHeader = require('getRequestHeader');
const getTimestampMillis = require('getTimestampMillis');
const getType = require('getType');
const JSON = require('JSON');
const logToConsole = require('logToConsole');
const makeInteger = require('makeInteger');
const makeString = require('makeString');
const Math = require('Math');
const parseUrl = require('parseUrl');
const sendHttpRequest = require('sendHttpRequest');
const setCookie = require('setCookie');

/**********************************************************************************************/

const eventData = getAllEventData();

if (!isConsentGivenOrNotRequired()) {
  return data.gtmOnSuccess();
}

const url = eventData.page_location || getRequestHeader('referer');
if (url && url.lastIndexOf('https://gtm-msr.appspot.com/', 0) === 0) {
  return data.gtmOnSuccess();
}

const mappedEventData = mapEvent(eventData, data);

if (areThereRequiredFieldsMissing(mappedEventData)) {
  log({
    Name: 'AdRoll',
    Type: 'Message',
    EventName: mappedEventData.event_name,
    Message: '🛑 [ERROR] Event was not sent to AdRoll.',
    Reason: 'Missing required fields'
  });

  return data.gtmOnFailure();
}

setCookiesIfNeeded(mappedEventData);
sendTrackRequest(mappedEventData);

if (data.useOptimisticScenario) {
  return data.gtmOnSuccess();
}

/**********************************************************************************************/
// Vendor related functions

function areThereRequiredFieldsMissing(mappedEventData) {
  // advertisable_eid, pixel_eid - verified by the template UI validation rules
  const requiredFields = ['event_name', 'page_location', 'ip'];
  const identifiers = [
    'adct',
    'email',
    'email_sha256',
    'email_md5',
    'device_id',
    'first_party_cookie'
  ];

  const missingBaseRequiredFields = requiredFields.some(
    (field) => !isValidValue(mappedEventData[field])
  );
  if (missingBaseRequiredFields) return true;

  const missingIdentifiers = identifiers.every(
    (id) => !isValidValue(mappedEventData.identifiers[id])
  );
  if (missingIdentifiers) return true;

  return false;
}

function getPostUrl() {
  const isTestMode = [true, 'true'].indexOf(data.testMode) !== -1;
  return (
    'https://srv.adroll.com/api?' +
    'advertisable=' +
    enc(data.advertisableId) +
    (isTestMode ? '&dry_run=1' : '')
  );
}

function sendTrackRequest(mappedEventData) {
  const postBody = mappedEventData;
  const postUrl = getPostUrl();

  sendHttpRequest(
    postUrl,
    (statusCode, headers, body) => {
      if (!data.useOptimisticScenario) {
        if (statusCode >= 200 && statusCode < 400) {
          data.gtmOnSuccess();
        } else {
          data.gtmOnFailure();
        }
      }
    },
    {
      headers: {
        Authorization: 'Token ' + data.accessToken,
        'Content-Type': 'application/json'
      },
      method: 'POST'
    },
    JSON.stringify(postBody)
  );
}

function mapEvent(eventData, data) {
  let mappedData = {
    advertisable_eid: data.advertisableId,
    pixel_eid: data.pixelId,
    event_name: getEventName(eventData, data),
    event_attributes: {},
    identifiers: {}
  };

  mappedData = addUserData(eventData, mappedData);
  mappedData = addAppDeviceData(eventData, mappedData);
  mappedData = addServerData(eventData, mappedData); // Must go after addAppDeviceData.
  mappedData = addCustomData(eventData, mappedData);

  return mappedData;
}

function getEventName(eventData, data) {
  if (data.eventType === 'inherit') {
    const eventName = eventData.event_name;

    const gaToEventName = {
      page_view: 'pageView',
      'gtm.dom': 'pageView',
      search: 'productSearch',
      view_search_results: 'productSearch',
      view_item_list: 'productSearch',
      add_to_cart: 'addToCart',
      complete_registration: 'purchase',
      sign_up: 'purchase',
      generate_lead: 'purchase',
      purchase: 'purchase',

      'gtm4wp.addProductToCartEEC': 'addToCart',
      'gtm4wp.orderCompletedEEC': 'purchase'
    };

    if (!gaToEventName[eventName]) {
      return eventName;
    }

    return gaToEventName[eventName];
  }

  return data.eventType === 'standard' ? data.eventNameStandard : data.eventNameCustom;
}

function addServerData(eventData, mappedData) {
  // Web (default)
  if (eventData.page_location) mappedData.page_location = eventData.page_location;
  // App (default)
  else if (mappedData.package_app_name && mappedData.package_app_version) {
    mappedData.page_location =
      'https://' +
      mappedData.package_app_name + // Used the package name to avoid adding a new field to the UI.
      '?' +
      'device_os=' +
      mappedData.device_os +
      '&device_type=' +
      mappedData.device_type +
      '&package_app_name=' +
      mappedData.package_app_name +
      '&package_app_version=' +
      mappedData.package_app_version;
  }

  if (eventData.timestamp) mappedData.timestamp = eventData.timestamp;
  else mappedData.timestamp = Math.round(getTimestampMillis() / 1000);

  // Override with user input data from template fields.
  if (data.serverDataList) {
    data.serverDataList.forEach((d) => {
      mappedData[d.name] = d.value;
    });
  }

  return mappedData;
}

function addUserData(eventData, mappedData) {
  const user_data = eventData.user_data || {};

  const clickId = getClickId();
  if (clickId) mappedData.identifiers.adct = clickId;

  const browserId = getBrowserId();
  if (browserId) mappedData.identifiers.first_party_cookie = browserId;

  const email = eventData.email || user_data.email_address || user_data.email;
  if (email) mappedData.identifiers.email = email;

  const emailSha256 = eventData.email_sha256 || user_data.sha256_email_address;
  if (emailSha256) mappedData.identifiers.email_sha256 = emailSha256;

  if (eventData.email_md5) mappedData.identifiers.email_md5 = eventData.email_md5;

  const userId = eventData.external_id || eventData.user_id || eventData.userId;
  if (userId) mappedData.identifiers.user_id = userId;

  const mobileDeviceId =
    eventData.mobile_device_id ||
    eventData['x-ga-resettable_device_id'] ||
    eventData['x-ga-vendor_device_id'];
  if (mobileDeviceId && mobileDeviceId !== '00000000-0000-0000-0000-000000000000')
    mappedData.identifiers.device_id = mobileDeviceId;

  if (eventData.ip_override) {
    mappedData.ip = eventData.ip_override.split(' ').join('').split(',')[0];
  }

  if (eventData.user_agent) mappedData.user_agent = eventData.user_agent;

  // Override with user input data from template fields.
  if (data.userDataList) {
    data.userDataList.forEach((d) => {
      // These go in the root level of the object.
      if (['ip', 'user_agent'].indexOf(d.name) !== -1) mappedData[d.name] = d.value;
      else mappedData.identifiers[d.name] = d.value;
    });
  }

  return mappedData;
}

function addAppDeviceData(eventData, mappedData) {
  const deviceOS = eventData.device_os || eventData['x-ga-platform']; // x-ga-platform is used in Firebase events to indicate the device OS.
  if (deviceOS) mappedData.device_os = deviceOS;

  if (eventData.device_type) mappedData.device_type = eventData.device_type;

  const appName = eventData.package_app_name || eventData.app_id;
  if (appName) mappedData.package_app_name = appName;

  const appVersion = eventData.package_app_version || eventData.app_version;
  if (appVersion) mappedData.package_app_version = appVersion;

  // Override with user input data from template fields.
  if (data.appDeviceDataList) {
    data.appDeviceDataList.forEach((d) => {
      mappedData[d.name] = d.value;
    });
  }

  return mappedData;
}

function addCustomData(eventData, mappedData) {
  let currencyFromItems = '';
  let valueFromItems = 0;

  if (eventData.items && eventData.items[0]) {
    mappedData.event_attributes.products = [];
    currencyFromItems = eventData.items[0].currency;

    const itemIdKey = data.itemIdKey ? data.itemIdKey : 'item_id';
    eventData.items.forEach((d, i) => {
      let content = {};
      if (d[itemIdKey]) content.product_id = makeString(d[itemIdKey]);
      if (d.quantity) content.quantity = makeInteger(d.quantity);
      if (d.item_category) content.category = d.item_category;
      if (d.product_group) content.product_group = d.product_group;
      if (d.price) {
        content.price = makeString(d.price);
        valueFromItems += d.quantity ? d.quantity * d.price : d.price;
      }
      mappedData.event_attributes.products.push(content);
    });
  }

  const value = eventData.value || valueFromItems;
  if (value) mappedData.conversion_value = value;

  const currency = eventData.currency || currencyFromItems;
  if (currency) mappedData.currency = currency;

  if (eventData.external_data) mappedData.external_data = eventData.external_data;

  if (eventData.search_term) mappedData.event_attributes.keywords = eventData.search_term;

  if (eventData.transaction_id) mappedData.event_attributes.order_id = eventData.transaction_id;

  if (data.customDataList) {
    data.customDataList.forEach((d) => {
      // These go in the 'event_attributes' object.
      if (['order_id', 'products', 'keywords'].indexOf(d.name) !== -1)
        mappedData.event_attributes[d.name] = d.value;
      else mappedData[d.name] = d.value;
    });
  }

  return mappedData;
}

function getClickId() {
  const searchParams = parseUrl(url).searchParams;
  if (searchParams && searchParams.adct) return searchParams.adct;
  const commonCookie = eventData.commonCookie || {};
  return (
    getCookieValues('__adroll_adct')[0] || eventData.__adroll_adct || commonCookie.__adroll_adct
  );
}

function getBrowserId() {
  const commonCookie = eventData.commonCookie || {};
  return (
    getCookieValues('__adroll_fpc')[0] ||
    eventData.__adroll_fpc ||
    commonCookie.__adroll_fpc ||
    (!data.notSetBrowserIdCookie && generateBrowserId())
  );
}

function generateBrowserId() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < 32; i++) {
    const randomIndex = generateRandom(0, characters.length - 1);
    result += characters.charAt(randomIndex);
  }

  result += '-' + getTimestampMillis();
  return result;
}

function setCookiesIfNeeded(eventData) {
  const cookieOptions = {
    domain: data.overridenCookieDomain || 'auto',
    path: '/',
    samesite: 'Lax',
    secure: true,
    'max-age': 31536000, // 365 days
    httpOnly: false
  };

  // "__adroll_adct" cookie creation. It contains the value of the "adct" query parameter (Click ID).
  // AdRoll client script currently doesn't save it to a cookie. Only the Landing Page to Session Storage.
  // We defined the cookie name using the same convention as used by the Browser ID.
  if (!data.notSetClickIdCookie && eventData.identifiers && eventData.identifiers.adct) {
    setCookie('__adroll_adct', eventData.identifiers.adct, cookieOptions);
  }

  // "__adroll_fpc" cookie creation. It contains the value of the Browser ID.
  if (
    !data.notSetBrowserIdCookie &&
    eventData.identifiers &&
    eventData.identifiers.first_party_cookie
  ) {
    setCookie('__adroll_fpc', eventData.identifiers.first_party_cookie, cookieOptions);
  }
}

/**********************************************************************************************/
// Helpers

function isValidValue(value) {
  const valueType = getType(value);
  return valueType !== 'null' && valueType !== 'undefined' && value !== '' && value === value;
}

function enc(data) {
  if (['null', 'undefined'].indexOf(getType(data)) !== -1) data = '';
  return encodeUriComponent(makeString(data));
}

function isConsentGivenOrNotRequired() {
  if (data.adStorageConsent !== 'required') return true;
  if (eventData.consent_state) return !!eventData.consent_state.ad_storage;
  const xGaGcs = eventData['x-ga-gcs'] || ''; // x-ga-gcs is a string like "G110"
  return xGaGcs[2] === '1';
}

function log(rawDataToLog) {
  rawDataToLog.TraceId = getRequestHeader('trace-id');
  logToConsole(JSON.stringify(rawDataToLog));
}
