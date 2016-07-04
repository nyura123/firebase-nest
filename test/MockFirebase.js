function makeMockSnapshot(key, data, asVal) {
    return {
        key: ()=>key,
        val: ()=>{
            if (data === undefined || data === null) return null;
            if (asVal) return data;
            if (typeof data != 'object') {
                return data;
            }
            var mockSnapshotVal = {};
            Object.keys(data || {}).forEach(childKey=> {
                var child = data[childKey];
                mockSnapshotVal[childKey] = makeMockSnapshot(childKey, child);
            });
            return mockSnapshotVal;
        }
    }
}

export default class MockFirebase {
    constructor(key, data, asVal) {
        this.callbacks = {};
        this.errorCallbacks = {};
        this.mockSnapshot = makeMockSnapshot(key, data, asVal);
        this.allocRefHandle = 1;
    }

    injectError(error) {
        Object.keys(this.errorCallbacks || {}).forEach(eventType => {
           Object.keys(this.errorCallbacks[eventType] || {}).forEach(refHandle => {
              this.errorCallbacks[eventType][refHandle](error);
           });
        });
    }

    on(eventType, callback, errorCallback) {
        var refHandle = this.allocRefHandle++;

        if (!this.callbacks[eventType]) {
            this.callbacks[eventType] = {};
        }
        this.callbacks[eventType][refHandle] = callback;

        if (!this.errorCallbacks[eventType]) {
            this.errorCallbacks[eventType] = {};
        }
        this.errorCallbacks[eventType][refHandle] = errorCallback;

        if (eventType == 'value') {
            setTimeout(()=>{
                if (this.callbacks['value'] && this.callbacks['value'][refHandle]) {
                    callback(this.mockSnapshot)
                }
            }, 5);
        } else if (eventType == 'child_added') {
            setTimeout(()=>{
                if (this.callbacks['child_added'] && this.callbacks['child_added'][refHandle]) {
                    Object.keys(this.mockSnapshot).forEach(key=>callback(this.mockSnapshot[key]));
                }
            }, 5);
        }

        return refHandle;
    }

    once(eventType, callback) {
        setTimeout(()=>{
            callback(this.mockSnapshot);
        }, 5);
    }

    off(eventType, refHandle) {
        var callbacks = (this.callbacks[eventType] || {});
        delete callbacks[refHandle];
        if (Object.keys(callbacks).length == 0) {
            delete this.callbacks[eventType];
        }
    }
}