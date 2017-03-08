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
        this.key = key;
        this.callbacks = {};
        this.mockSnapshot = makeMockSnapshot(key, data, asVal);
        this.allocRefHandle = 1;

        //for forcing callbacks
        this.callbacksByEventType = {};
    }

    injectError(error) {
        this.injectedError = error;
    }

    on(eventType, callback, errorCallback) {
        var refHandle = this.allocRefHandle++;

        if (!this.callbacks[eventType]) {
            this.callbacks[eventType] = {};
        }
        this.callbacks[eventType][refHandle] = callback;

        this.callbacksByEventType[eventType] = callback;

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

        if (this.injectedError && errorCallback) {
            errorCallback(this.injectedError);
        }

        return refHandle;
    }

    once(eventType, callback) {
        this.callbacksByEventType[eventType] = callback;
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

    forceCallback(eventType, value, {once} = {}) {
        const callback = this.callbacksByEventType[eventType];
        if (callback) {
            callback(makeMockSnapshot(this.key, value));
        }
    }
}