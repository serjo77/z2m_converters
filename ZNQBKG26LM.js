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
const herdsman = require('zigbee-herdsman');
const ota = require('zigbee-herdsman-converters/lib/ota');
const exposes = require( 'zigbee-herdsman-converters/lib/exposes' );
const reporting = require( 'zigbee-herdsman-converters/lib/reporting' );
const extend = require( 'zigbee-herdsman-converters/lib/extend' );
const e = exposes.presets;
const ea = exposes.access;

const manufacturerOptions = {
    sunricher: {manufacturerCode: herdsman.Zcl.ManufacturerCode.SHENZHEN_SUNRICH},
    xiaomi: {manufacturerCode: herdsman.Zcl.ManufacturerCode.LUMI_UNITED_TECH, disableDefaultResponse: true},
    osram: {manufacturerCode: herdsman.Zcl.ManufacturerCode.OSRAM},
    eurotronic: {manufacturerCode: herdsman.Zcl.ManufacturerCode.JENNIC},
    danfoss: {manufacturerCode: herdsman.Zcl.ManufacturerCode.DANFOSS},
    hue: {manufacturerCode: herdsman.Zcl.ManufacturerCode.PHILIPS},
    ikea: {manufacturerCode: herdsman.Zcl.ManufacturerCode.IKEA_OF_SWEDEN},
    sinope: {manufacturerCode: herdsman.Zcl.ManufacturerCode.SINOPE_TECH},
    tint: {manufacturerCode: herdsman.Zcl.ManufacturerCode.MUELLER_LICHT_INT},
    legrand: {manufacturerCode: herdsman.Zcl.ManufacturerCode.VANTAGE, disableDefaultResponse: true},
    viessmann: {manufacturerCode: herdsman.Zcl.ManufacturerCode.VIESSMAN_ELEKTRO},
};

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

// Взято из файла 'zigbee-herdsman-converters/converters/toZigbee' 
// и добавлена модель выключателя. В случае обновления этого кода в оригинальном файле
// нужно обновить этот кусок и здесь.
tz.xiaomi_switch_power_outage_memory = {
        key: ['power_outage_memory'],
        convertSet: async (entity, key, value, meta) => {
            if (['SP-EUC01', 'ZNCZ04LM', 'ZNCZ12LM', 'ZNCZ15LM', 'QBCZ14LM', 'QBCZ15LM', 'SSM-U01', 'SSM-U02', 'DLKZMK11LM', 'DLKZMK12LM',
                'WS-EUK01', 'WS-EUK02', 'WS-EUK03', 'WS-EUK04', 'QBKG19LM', 'QBKG20LM', 'QBKG25LM', 'QBKG26LM', 'QBKG28LM',
                'QBKG31LM', 'QBKG34LM', 'QBKG38LM', 'QBKG39LM', 'QBKG40LM', 'QBKG41LM', 'ZNDDMK11LM', 
                'WS-USC02', 'WS-USC04', 'ZNQBKG31LM', 'ZNQBKG26LM',
            ].includes(meta.mapped.model)) {
                await entity.write('aqaraOpple', {0x0201: {value: value ? 1 : 0, type: 0x10}}, manufacturerOptions.xiaomi);
            } else if (['ZNCZ02LM', 'QBCZ11LM', 'LLKZMK11LM', 'ZNLDP13LM'].includes(meta.mapped.model)) {
                const payload = value ?
                    [[0xaa, 0x80, 0x05, 0xd1, 0x47, 0x07, 0x01, 0x10, 0x01], [0xaa, 0x80, 0x03, 0xd3, 0x07, 0x08, 0x01]] :
                    [[0xaa, 0x80, 0x05, 0xd1, 0x47, 0x09, 0x01, 0x10, 0x00], [0xaa, 0x80, 0x03, 0xd3, 0x07, 0x0a, 0x01]];

                await entity.write('genBasic', {0xFFF0: {value: payload[0], type: 0x41}}, manufacturerOptions.xiaomi);
                await entity.write('genBasic', {0xFFF0: {value: payload[1], type: 0x41}}, manufacturerOptions.xiaomi);
            } else if (['ZNCZ11LM'].includes(meta.mapped.model)) {
                const payload = value ?
                    [0xaa, 0x80, 0x05, 0xd1, 0x47, 0x00, 0x01, 0x10, 0x01] :
                    [0xaa, 0x80, 0x05, 0xd1, 0x47, 0x01, 0x01, 0x10, 0x00];

                await entity.write('genBasic', {0xFFF0: {value: payload, type: 0x41}}, manufacturerOptions.xiaomi);
            } else {
                throw new Error('Not supported');
            }
            return {state: {power_outage_memory: value}};
        },
        convertGet: async (entity, key, meta) => {
            if (['SP-EUC01', 'ZNCZ04LM', 'ZNCZ12LM', 'ZNCZ15LM', 'QBCZ14LM', 'QBCZ15LM', 'SSM-U01', 'SSM-U02', 'DLKZMK11LM', 'DLKZMK12LM',
                'WS-EUK01', 'WS-EUK02', 'WS-EUK03', 'WS-EUK04', 'QBKG19LM', 'QBKG20LM', 'QBKG25LM', 'QBKG26LM', 'QBKG28LM',
                'QBKG31LM', 'QBKG34LM', 'QBKG38LM', 'QBKG39LM', 'QBKG40LM', 'QBKG41LM', 'ZNDDMK11LM', 'ZNLDP13LM',
                'WS-USC02', 'WS-USC04', 'ZNQBKG31LM', 'ZNQBKG26LM',
            ].includes(meta.mapped.model)) {
                await entity.read('aqaraOpple', [0x0201]);
            } else if (['ZNCZ02LM', 'QBCZ11LM', 'ZNCZ11LM'].includes(meta.mapped.model)) {
                await entity.read('aqaraOpple', [0xFFF0]);
            } else {
                throw new Error('Not supported');
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
            e.power_outage_memory(), 
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
            tz.xiaomi_switch_power_outage_memory,
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
