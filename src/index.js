const _ = require('lodash');
const functions = require('firebase-functions');

class MockFunctions {

  constructor(database) {
    this.database = database;
    this.projectName = 'test';
  }

  setFunctionsModule(index) {
    this.index = index;
  }

  writeAndTrigger(path, delta, fromApp) {
    // TODO: also trigger parents
    const fullPath = `projects/_/instances/${this.projectName}/refs/${path.replace(/^\//, '')}`;
    const resourceRegex = (fn) =>
      _.get(fn, ['__trigger', 'eventTrigger', 'resource'], '')
        .replace(/{([^}]+)}/g, '([^/]+)');
    const getParamNames = (fn) =>
      (_.get(fn, ['__trigger', 'eventTrigger', 'resource'], '').match(/{(.*?)}/g) || [])
        .map((name) => name.replace(/[{}]/g, ''));
    
    return this.database().ref(path)
      .once('value')
      .then((existingSnapshot) => {
        const deltaSnapshot = new functions.database().DeltaSnapshot(fromApp || this.database().app, this.database().app, existingSnapshot.val(), delta, path);
        return this.database().ref(path)
          .set(deltaSnapshot.val())
          .then(() => { return Promise.all(
            _.chain(this.index)
              .pickBy((fn) => _.get(fn, ['__trigger', 'eventTrigger', 'eventType']) === 'providers/google.firebase.database/eventTypes/ref.write')
              .map(function(fn, name) {
                const fnMatch = fullPath.match(resourceRegex(fn));
                if (fnMatch) {
                  // console.log "Triggering #{name}"
                  const paramNames = getParamNames(fn);
                  const params = _.chain(paramNames)
                    .map((name) => [name, fnMatch[paramNames.indexOf(name) + 1]])
                    .fromPairs()
                    .value();
                  return fn({
                    eventId: 'fakeEventId',
                    eventType: fn.__trigger.eventTrigger.eventType,
                    params,
                    data: deltaSnapshot
                  });
                }}).value()
          );
          });
      });
  }

  triggerHttpsFunction(path, query) {
    const { index } = this;
    return new Promise(function(resolve, reject) {
      // console.log "Triggering #{path}"
      return index[path.replace(/^\//, '')]({query}, {
          send: resolve,
          sendStatus: resolve
        }
      );
    });
  }

  triggerUserDeleted(userRecord) {
    return Promise.all(
      _.chain(this.index)
        .pickBy((fn) => _.get(fn, '__trigger.eventTrigger.eventType') === 'providers/firebase.auth/eventTypes/user.delete')
        .map((fn, name) =>
          // console.log "Triggering #{name}"
          fn({data: userRecord})).value()
    );
  }

  writeWithoutTriggers(path, value) {
    return this.database().ref(path)
      .set(value);
  }

  value(path) {
    return this.database().ref(path)
      .once('value')
      .then((snapshot) => snapshot.val());
  }
}

module.exports = MockFunctions;
