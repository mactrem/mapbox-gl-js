/* eslint-env browser */
/* global mapboxgl:readonly */
import customLayerImplementations from '../custom_layer_implementations.js';

function handleOperation(map, options, opIndex, doneCb) {
    const operations = options.operations;
    const operation = operations[opIndex];
    const opName = operation[0];
    //Delegate to special handler if one is available
    if (opName in operationHandlers) {
        operationHandlers[opName](map, operation.slice(1), () => {
            doneCb(opIndex);
        });
    } else {
        map[opName](...operation.slice(1));
        doneCb(opIndex);
    }
}

export const operationHandlers = {
    wait(map, params, doneCb) {
        const wait = function() {
            if (params.length) {
                window._renderTestNow += params[0];
                mapboxgl.setNow(window._renderTestNow);
                map._render();
                doneCb();
            } else {
                if (map.loaded()) {
                    doneCb();
                } else {
                    map.once('render', wait);
                }
            }
        };
        wait();
    },
    idle(map, params, doneCb) {
        const idle = function() {
            if (!map.isMoving()) {
                doneCb();
            } else {
                map.once('render', idle);
            }
        };
        idle();
    },
    sleep(map, params, doneCb) {
        setTimeout(doneCb, params[0]);
    },
    addImage(map, params, doneCb) {
        const image = new Image();
        image.onload = () => {
            map.addImage(params[0], image, params[2] || {});
            doneCb();
        };

        image.src = params[1].replace('./', '');
        image.onerror = () => {
            throw new Error(`addImage opertation failed with src ${image.src}`);
        };
    },
    addCustomLayer(map, params, doneCb) {
        map.addLayer(new customLayerImplementations[params[0]](), params[1]);
        map._render();
        doneCb();
    },
    updateFakeCanvas(map, params, doneCb) {
        const updateFakeCanvas = async function() {
            const canvasSource = map.getSource(params[0]);
            canvasSource.play();
            // update before pause should be rendered
            await updateCanvas(params[1]);
            canvasSource.pause();
            await updateCanvas(params[2]);
            map._render();
            doneCb();
        };
        updateFakeCanvas();
    },
    setStyle(map, params, doneCb) {
        // Disable local ideograph generation (enabled by default) for
        // consistent local ideograph rendering using fixtures in all runs of the test suite.
        map.setStyle(params[0], {localIdeographFontFamily: false});
        doneCb();
    },
    pauseSource(map, params, doneCb) {
        for (const sourceCache of map.style._getSourceCaches(params[0])) {
            sourceCache.pause();
        }
        doneCb();
    },
    setCameraPosition(map, params, doneCb) {
        const options = map.getFreeCameraOptions();
        const location = params[0];  // lng, lat, altitude
        options.position = mapboxgl.MercatorCoordinate.fromLngLat(new mapboxgl.LngLat(location[0], location[1]), location[2]);
        map.setFreeCameraOptions(options);
        doneCb();
    },
    lookAtPoint(map, params, doneCb) {
        const options = map.getFreeCameraOptions();
        const location = params[0];
        const upVector = params[1];
        options.lookAtPoint(new mapboxgl.LngLat(location[0], location[1]), upVector);
        map.setFreeCameraOptions(options);
        doneCb();
    }
};

export function applyOperations(map, options) {
    return new Promise((resolve, reject) => {
        const operations = options.operations;
        // No operations specified, end immediately and invoke doneCb.
        if (!operations || operations.length === 0) {
            resolve();
            return;
        }

        // Start recursive chain
        const scheduleNextOperation = (lastOpIndex) => {
            if (lastOpIndex === operations.length - 1) {
                // Stop recusive chain when at the end of the operations
                resolve();
                return;
            }
            map.once('error', (e) => {
                reject(new Error(`Error occured during ${JSON.stringify(options.operations[lastOpIndex + 1])}. ${e.error.stack}`));
            });
            handleOperation(map, options, ++lastOpIndex, scheduleNextOperation);
        };
        scheduleNextOperation(-1);
    });
}

function updateCanvas(imagePath) {
    return new Promise((resolve) => {
        const canvas = window.document.getElementById('fake-canvas');
        const ctx = canvas.getContext('2d');
        const image = new Image();
        image.src = imagePath.replace('./', '');
        image.onload = () => {
            resolve(ctx.drawImage(image, 0, 0, image.width, image.height));
        };

        image.onerror = () => {
            throw new Error(`updateFakeCanvas failed to load image at ${image.src}`);
        };
    });
}
