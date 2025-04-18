import { MediaConvertClient, GetJobTemplateCommand, CreateJobCommand } from '@aws-sdk/client-mediaconvert';
import path from 'path';

const executeEncoder = async (inputFileName) => {
    const { MEDIA_CONVERT_ENDPOINT, MEDIA_CONVERT_JOB_TEMPLATE_NAME, MEDIA_CONVERT_ROLE_ARN, INPUT_SOURCE_S3_BUCKET, INPUT_SOURCE_FOLDER, OUTPUT_DESTINATION_S3_BUCKET, OUTPUT_DESTINATION_FOLDER } = process.env;
    const client = new MediaConvertClient({
        endpoint: MEDIA_CONVERT_ENDPOINT,
    });
    const getJobTemplateInput = {
        Name: MEDIA_CONVERT_JOB_TEMPLATE_NAME,
    };
    const getJobTemplateCommand = new GetJobTemplateCommand(getJobTemplateInput);
    const jobTemplateResponse = await client.send(getJobTemplateCommand);
    const jobTemplate = jobTemplateResponse.JobTemplate;
    const jobSettings = {
        ...jobTemplate.Settings
    };

    const selectors = Object.keys(jobTemplate.Settings.Inputs[0].AudioSelectors);
    const defaultAudioSelectorName = selectors.find((selector) => jobTemplate.Settings.Inputs[0].AudioSelectors[selector].DefaultSelection === 'DEFAULT');
    const defaultAudioSelector = jobTemplate.Settings.Inputs[0].AudioSelectors[defaultAudioSelectorName];

    const Inputs = jobTemplate.Settings.Inputs.map((input) => ({ ...input, FileInput: `s3://${INPUT_SOURCE_S3_BUCKET}/${INPUT_SOURCE_FOLDER}/${inputFileName}`, AudioSelectors: { defaultAudioSelectorName: defaultAudioSelector }, CaptionSelectors: {} }));
    jobSettings.Inputs = Inputs;

    const fileNameWithoutExt = path.parse(path.basename(inputFileName)).name;

    const outputGroups = jobSettings.OutputGroups.map((outputGroup) => ({
        ...outputGroup,
        OutputGroupSettings: {
            ...outputGroup.OutputGroupSettings,
            HlsGroupSettings: {
                ...outputGroup.OutputGroupSettings.HlsGroupSettings,
                Destination: `s3://${OUTPUT_DESTINATION_S3_BUCKET}/${OUTPUT_DESTINATION_FOLDER}/${fileNameWithoutExt}/hls/`
            }
        },
        Outputs: outputGroup.Outputs.map((output) => ({
            ...output,
            AudioDescriptions: output.AudioDescriptions?.filter((audioDescription) => audioDescription.AudioSourceName === defaultAudioSelectorName) || [],
            CaptionDescriptions: [],
        })).filter((output) => output.AudioDescriptions?.length > 0 || output.CaptionDescriptions?.length > 0 || Object.keys(output.VideoDescription || {}).length > 0)
    }));
    jobSettings.OutputGroups = outputGroups;
    const jobInput = {
        Role: MEDIA_CONVERT_ROLE_ARN,
        Queue: jobTemplate.Queue,
        BillingTagsSource: 'JOB',
        Priority: jobTemplate.Priority,
        AccelerationSettings: jobTemplate.AccelerationSettings,
        HopDestinations: jobTemplate.HopDestinations,
        Settings: jobSettings,
        StatusUpdateInterval: "SECONDS_60"
    };
    const createJobCommand = new CreateJobCommand(jobInput);
    //const createJobResponse = await client.send(createJobCommand);
    return jobInput;
};


(async () => {
    try {
        const inputFileName = 'polar_bear.mp4'
        const response = await executeEncoder(inputFileName);
        console.log(JSON.stringify(response, null, 2));
    } catch (err) {
        console.error("Error filtering files:", err);
    }
})();