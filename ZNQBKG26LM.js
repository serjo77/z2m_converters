// Название: Aqara smart wall switch H1M (with neutral, three rocker)
// Модель: ZNQBKG26LM
// modelID: lumi.switch.acn031
// manufacturerName: LUMI

const {
    precisionRound, mapNumberRange, isLegacyEnabled, toLocalISOString, numberWithinRange, hasAlreadyProcessedMessage,
    calibrateAndPrecisionRoundOptions, addActionGroup, postfixWithEndpointName, getKey,
    batteryVoltageToPercentage, getMetaValue,
} = require('zigbee-herdsman-converters/lib/utils');
const fz = require( 'zigbee-herdsman-converters/converters/fromZigbee' );
const tz = require( 'zigbee-herdsman-converters/converters/toZigbee' );
const ota = require('zigbee-herdsman-converters/lib/ota');
const exposes = require( 'zigbee-herdsman-converters/lib/exposes' );
const reporting = require( 'zigbee-herdsman-converters/lib/reporting' );
const extend = require( 'zigbee-herdsman-converters/lib/extend' );
const e = exposes.presets;
const ea = exposes.access;

const preventReset = async (type, data, device) => {
    if (
        // options.allow_reset ||
        type !== 'message' ||
        data.type !== 'attributeReport' ||
        data.cluster !== 'genBasic' ||
        !data.data[0xfff0] ||
        // eg: [0xaa, 0x10, 0x05, 0x41, 0x87, 0x01, 0x01, 0x10, 0x00]
        !data.data[0xFFF0].slice(0, 5).equals(Buffer.from([0xaa, 0x10, 0x05, 0x41, 0x87]))
    ) {
        return;
    }
    const options = {manufacturerCode: 0x115f};
    const payload = {[0xfff0]: {
        value: [0xaa, 0x10, 0x05, 0x41, 0x47, 0x01, 0x01, 0x10, 0x01],
        type: 0x41,
    }};
    await device.getEndpoint(1).write('genBasic', payload, options);
};

// Взято из файла 'zigbee-herdsman-converters/converters/fromZigbee' 
// и добавлена модель выключателя. В случае обновления этого кода в оригинальном файле
// нужно обновить этот кусок и здесь.
fz.xiaomi_multistate_action = {
        cluster: 'genMultistateInput',
        type: ['attributeReport'],
        convert: (model, msg, publish, options, meta) => {
            if (hasAlreadyProcessedMessage(msg, model)) return;
            let actionLookup = {0: 'hold', 1: 'single', 2: 'double', 3: 'triple', 255: 'release'};
            if (model.model === 'WXKG12LM') {
                actionLookup = {...actionLookup, 16: 'hold', 17: 'release', 18: 'shake'};
            }

            let buttonLookup = null;
            if (['WXKG02LM_rev2', 'WXKG07LM', 'WXKG15LM', 'WXKG17LM'].includes(model.model)) {
                buttonLookup = {1: 'left', 2: 'right', 3: 'both'};
            }
            if (['QBKG12LM', 'QBKG24LM'].includes(model.model)) buttonLookup = {5: 'left', 6: 'right', 7: 'both'};
            if (['QBKG39LM', 'QBKG41LM', 'WS-EUK02', 'WS-EUK04', 'QBKG20LM', 'QBKG31LM'].includes(model.model)) {
                buttonLookup = {41: 'left', 42: 'right', 51: 'both'};
            }
            if (['QBKG25LM', 'QBKG26LM', 'QBKG34LM', 'ZNQBKG31LM', 'ZNQBKG26LM'].includes(model.model)) {
                buttonLookup = {
                    41: 'left', 42: 'center', 43: 'right',
                    51: 'left_center', 52: 'left_right', 53: 'center_right',
                    61: 'all',
                };
            }
            if (['WS-USC02', 'WS-USC04'].includes(model.model)) {
                buttonLookup = {41: 'top', 42: 'bottom', 51: 'both'};
            }

            const action = actionLookup[msg.data['presentValue']];
            if (buttonLookup) {
                const button = buttonLookup[msg.endpoint.ID];
                if (button) {
                    return {action: `${action}_${button}`};
                }
            } else {
                return {action};
            }
        },
}

const definition = {
        zigbeeModel: ['lumi.switch.acn031'],
        model: 'ZNQBKG26LM',
        vendor: 'Xiaomi',
        description: 'Aqara smart wall switch H1M (with neutral, three rocker)',
        exposes: [
            e.switch().withEndpoint('left'), 
            e.switch().withEndpoint('center'), 
            e.switch().withEndpoint('right'),
            exposes.enum('operation_mode', ea.ALL, ['control_relay', 'decoupled'])
                .withDescription('Decoupled mode for left button')
                .withEndpoint('left'),
            exposes.enum('operation_mode', ea.ALL, ['control_relay', 'decoupled'])
                .withDescription('Decoupled mode for center button')
                .withEndpoint('center'),
            exposes.enum('operation_mode', ea.ALL, ['control_relay', 'decoupled'])
                .withDescription('Decoupled mode for right button')
                .withEndpoint('right'),
            e.power().withAccess(ea.STATE), 
            //e.power_outage_memory(), 
            //e.led_disabled_night(), 
            e.voltage(),
            e.energy(),
            e.device_temperature().withAccess(ea.STATE), 
            e.flip_indicator_light(),
            e.action([
                'single_left', 'double_left', 'single_center', 'double_center', 'single_right', 'double_right',
                'single_left_center', 'double_left_center', 'single_left_right', 'double_left_right',
                'single_center_right', 'double_center_right', 'single_all', 'double_all']),
        ],
        fromZigbee: [
            fz.on_off, 
            fz.xiaomi_power, 
            fz.aqara_opple, 
            fz.xiaomi_multistate_action
        ],
        toZigbee: [
            tz.on_off, 
            tz.xiaomi_switch_operation_mode_opple, 
            //tz.xiaomi_switch_power_outage_memory,
            //tz.xiaomi_led_disabled_night, 
            tz.xiaomi_flip_indicator_light
        ],
        meta: {multiEndpoint: true},
        endpoint: (device) => {
            return {'left': 1, 'center': 2, 'right': 3};
        },
        configure: async (device, coordinatorEndpoint, logger) => {
            await device.getEndpoint(1).write('aqaraOpple', {'mode': 1}, {manufacturerCode: 0x115f, disableResponse: true});
        },
        onEvent: preventReset,
        //ota: ota.zigbeeOTA,
    };

module.exports = definition;
