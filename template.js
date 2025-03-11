const getRequestHeader = require('getRequestHeader');
const getAllEventData = require('getAllEventData');
const setCookie = require('setCookie');
const getCookieValues = require('getCookieValues');
const encodeUriComponent = require('encodeUriComponent');
const makeString = require('makeString');
const makeInteger = require('makeInteger');
const sendHttpRequest = require('sendHttpRequest');
const JSON = require('JSON');
const logToConsole = require('logToConsole');
const generateRandom = require('generateRandom');
const getTimestampMillis = require('getTimestampMillis');
const getContainerVersion = require('getContainerVersion');
const parseUrl = require('parseUrl');
const Math = require('Math');

/**********************************************************************************************/

const isLoggingEnabled = determinateIsLoggingEnabled();
const traceId = isLoggingEnabled ? getRequestHeader('trace-id') : undefined;

const eventData = getAllEventData();

if (!isConsentGivenOrNotRequired()) {
  return data.gtmOnSuccess();
}

const url = eventData.page_location || getRequestHeader('referer');

if (url && url.lastIndexOf('https://gtm-msr.appspot.com/', 0) === 0) {
  return data.gtmOnSuccess();
}

const mappedEventData = mapEvent(eventData, data);

setCookiesIfNeeded(mappedEventData);

sendTrackRequest(mappedEventData);

if (data.useOptimisticScenario) {
  data.gtmOnSuccess();
}

/**********************************************************************************************/
// Vendor related functions

function getPostUrl() {
  return 'https://srv.adroll.com/api?' +
    'advertisable=' + enc(data.advertisableId) +
    '&dry_run=' + (data.testMode ? '1' : '0');
}

function sendTrackRequest(mappedEventData) {
  const postBody = mappedEventData;
  const postUrl = getPostUrl();
  
  if (isLoggingEnabled) {
    logToConsole(
      JSON.stringify({
        Name: 'Adroll',
        Type: 'Request',
        TraceId: traceId,
        EventName: mappedEventData.event_name,
        RequestMethod: 'POST',
        RequestUrl: postUrl,
        RequestBody: postBody
      })
    );
  }
  
  sendHttpRequest(
    postUrl,
    (statusCode, headers, body) => {
      if (isLoggingEnabled) {
        logToConsole(
          JSON.stringify({
            Name: 'Adroll',
            Type: 'Response',
            TraceId: traceId,
            EventName: mappedEventData.event_name,
            ResponseStatusCode: statusCode,
            ResponseHeaders: headers,
            ResponseBody: body,
          })
        );
      }

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
        'Authorization': 'token ' + data.accessToken,
        'Content-Type': 'application/json'
      },
      method: 'POST'
    },
    JSON.stringify(postBody)
  );
}

function getEventName(eventData, data) {
  if (data.eventType === 'inherit') {
    let eventName = eventData.event_name;

    let gaToEventName = {
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
      'gtm4wp.orderCompletedEEC': 'purchase',
    };

    if (!gaToEventName[eventName]) {
      return eventName;
    }

    return gaToEventName[eventName];
  }

  return data.eventType === 'standard' ? data.eventNameStandard : data.eventNameCustom;
}

function mapEvent(eventData, data) {
  let mappedData = {
    advertisable_eid: data.advertisableId,
    pixel_eid: data.pixelId,
    event_name: getEventName(eventData, data),
    event_attributes: {},
    identifiers: {},
  };

  mappedData = addServerData(eventData, mappedData);
  mappedData = addUserData(eventData, mappedData);
  mappedData = addAppDeviceData(eventData, mappedData);
  mappedData = addCustomData(eventData, mappedData);
  // mappedData = hashDataIfNeeded(mappedData);

  return mappedData;
}

function addServerData(eventData, mappedData) {
  if (eventData.page_location) mappedData.page_location = eventData.page_location;

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
  
  if (eventData.email) mappedData.identifiers.email = eventData.email;
  else if (user_data.email_address) mappedData.identifiers.email = user_data.email_address;
  else if (user_data.email) mappedData.identifiers.email = user_data.email;
  
  if (eventData.external_id) mappedData.identifiers.user_id = eventData.external_id;
  else if (eventData.user_id) mappedData.identifiers.user_id = eventData.user_id;
  else if (eventData.userId) mappedData.identifiers.user_id = eventData.userId;
  
  // TO DO
  // Add 'device_id' - What is the expected 'device_id'?
  
  if (eventData.ip_override) {
    mappedData.ip = eventData.ip_override.split(' ').join('').split(',')[0];
  }
  
  if (eventData.user_agent) mappedData.user_agent = eventData.user_agent;

  // Override with user input data from template fields.
  if (data.userDataList) {
    data.userDataList.forEach((d) => {
      // IP and User Agent go in the root level of the object.
      if (['ip', 'user_agent'].includes(d.name)) mappedData[d.name] = d.value;
      else mappedData.identifiers[d.name] = d.value;
    });
  }
  
  return mappedData;
}

function addAppDeviceData(eventData, mappedData) {
  if (eventData.device_os) mappedData.device_os = eventData.device_os;
  else if (eventData['x-ga-platform']) mappedData.device_os = eventData['x-ga-platform']; // Firebase events
  
  if (eventData.device_type) mappedData.device_type = eventData.device_type;
  
  if (eventData.package_app_name) mappedData.package_app_name = eventData.package_app_name;
  else if (eventData.app_id) mappedData.package_app_name = eventData.app_id; // Firebase events
  
  if (eventData.package_app_version) mappedData.package_app_version = eventData.package_app_version;
  else if (eventData.app_version) mappedData.package_app_version = eventData.app_version; // Firebase events
  
  // Override with user input data from template fields.
  if (data.appDeviceDataList) {
    data.appDeviceDataList.forEach((d) => {
      mappedData[d.name] = d.value;
    });
  }
  
  return mappedData;
}

function addCustomData(eventData, mappedData) {
/*
  'event_attributes': None, // Object (with nested objects and array) 
    // { 
         [?] total: '56.78'  // Item value or cart value (Does it make sense since there's already the 'conversion_value' in the level above?)
         [?] keywords: ''    // Does it make sense since there's already the 'keyword' in the level above?
         [?] user_id: ''     // Does it make sense since there's already 'user_id' in the 'identifiers' object in the level above?
       }
*/
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
      if (d.item_category) content.item_category = d.item_category;
      if (d.product_group) content.quantity = d.product_group;
      if (d.price) {
        content.price = makeString(d.price);
        valueFromItems += d.quantity ? d.quantity * d.price : d.price;
      }
      mappedData.event_attributes.products[i] = content;
    });
  }
  
  if (eventData['x-ga-mp1-ev']) mappedData.conversion_value = eventData['x-ga-mp1-ev'];
  else if (eventData['x-ga-mp1-tr']) mappedData.conversion_value = eventData['x-ga-mp1-tr'];
  else if (eventData.value) mappedData.conversion_value = eventData.value;
  else if (valueFromItems) mappedData.conversion_value = valueFromItems;
  
  if (eventData.currency) mappedData.currency = eventData.currency;
  else if (currencyFromItems) mappedData.currency = currencyFromItems;
  
  if (eventData.search_term) mappedData.keyword = eventData.search_term;
  
  if (eventData.transaction_id) mappedData.event_attributes.order_id = eventData.transaction_id;
  
  if (data.customDataList) {
    data.customDataList.forEach((d) => {
      // 'products' and 'order_id' go in the 'event_attributes' object.
      if (['products', 'order_id'].includes(d.name)) mappedData.event_attributes[d.name] = d.value;
      mappedData[d.name] = d.value;
    });
  }
  
  return mappedData;
}

function getClickId () {
  const searchParams = parseUrl(url).searchParams;
  if (searchParams && searchParams.adct) return searchParams.adct;
  const commonCookie = eventData.commonCookie || {};
  return eventData.adct || commonCookie.adct || getCookieValues('__adroll_adct')[0];
}

function getBrowserId () {
  const commonCookie = eventData.commonCookie || {};
  return getCookieValues('__adroll_fpc')[0] || eventData.__adroll_fpc || commonCookie.__adroll_fpc || generateBrowserId();
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
    httpOnly: false,
  };
  
  // "__adroll_adct" cookie creation. It contains the value of the "adct" query parameter (Click ID).
  // Not sure if the cookie have this name or not. Need to confirm it.
  if (eventData.identifiers && eventData.identifiers.adct) {
    setCookie('__adroll_adct', eventData.identifiers.adct, cookieOptions);
  }
  
  // "__adroll_fpc" cookie creation. It contains the value of the Browser ID.
  if (eventData.identifiers && eventData.identifiers.first_party_cookie) {
    setCookie('__adroll_fpc', eventData.identifiers.first_party_cookie, cookieOptions);
  }
}

// function hashDataIfNeeded() {}

/**********************************************************************************************/
// Helpers

function enc(data) {
  data = data || '';
  return encodeUriComponent(makeString(data));
}

function isConsentGivenOrNotRequired() {
  if (data.adStorageConsent !== 'required') return true;
  if (eventData.consent_state) return !!eventData.consent_state.ad_storage;
  const xGaGcs = eventData['x-ga-gcs'] || ''; // x-ga-gcs is a string like "G110"
  return xGaGcs[2] === '1';
}

function determinateIsLoggingEnabled() {
  const containerVersion = getContainerVersion();
  const isDebug = !!(
    containerVersion &&
    (containerVersion.debugMode || containerVersion.previewMode)
  );

  if (!data.logType) {
    return isDebug;
  }

  if (data.logType === 'no') {
    return false;
  }

  if (data.logType === 'debug') {
    return isDebug;
  }

  return data.logType === 'always';
}
