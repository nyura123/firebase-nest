function makeMockSnapshot(key, data) {
    return {
        key: ()=>key,
        val: ()=>{
            if (data === undefined || data === null) return null;
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
    constructor(key, data) {
        this.callbacks = {};
        this.mockSnapshot = makeMockSnapshot(key, data);
        this.allocRefHandle = 1;
    }

    on(eventType, callback) {
        var refHandle = this.allocRefHandle++;

        if (!this.callbacks[eventType]) {
            this.callbacks[eventType] = {};
        }
        this.callbacks[eventType][refHandle] = callback;

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