// @flow

import FS from 'file-saver';
import Papa from 'papaparse';
import isEqual from 'lodash/isEqual';
import {
  List,
  Map,
  get,
  getIn
} from 'immutable';
import { Models } from 'lattice';
import { DataProcessingUtils } from 'lattice-fabricate';
import { DateTime } from 'luxon';

import DataTypes from '../constants/DataTypes';
import * as ContextualSchema from '../schemas/ContextualSchema';
import * as DaySpanSchema from '../schemas/DaySpanSchema';
import * as NightTimeActivitySchema from '../schemas/NightTimeActivitySchema';
import * as PreSurveySchema from '../schemas/PreSurveySchema';
import * as PrimaryActivitySchema from '../schemas/PrimaryActivitySchema';
import * as SurveyIntroSchema from '../schemas/SurveyIntroSchema';
import { PROPERTY_TYPE_FQNS } from '../../../core/edm/constants/FullyQualifiedNames';
import { PAGE_NUMBERS, QUESTION_TITLE_LOOKUP } from '../constants/GeneralConstants';
import { PRIMARY_ACTIVITIES, PROPERTY_CONSTS } from '../constants/SchemaConstants';
import type { DataType } from '../constants/DataTypes';

const { READING, MEDIA_USE } = PRIMARY_ACTIVITIES;

const {
  DAY_SPAN_PAGE,
  FIRST_ACTIVITY_PAGE,
  PRE_SURVEY_PAGE,
  SURVEY_INTRO_PAGE
} = PAGE_NUMBERS;

const { FQN } = Models;

const {
  ACTIVITY_END_TIME,
  ACTIVITY_NAME,
  ACTIVITY_START_TIME,
  ADULT_MEDIA,
  BG_AUDIO_DAY,
  BG_AUDIO_NIGHT,
  BG_TV_DAY,
  BG_TV_NIGHT,
  CAREGIVER,
  CLOCK_FORMAT,
  DAY_END_TIME,
  DAY_OF_WEEK,
  DAY_START_TIME,
  FAMILY_ID,
  HAS_FOLLOWUP_QUESTIONS,
  NON_TYPICAL_DAY_REASON,
  NON_TYPICAL_SLEEP_PATTERN,
  PRIMARY_BOOK_TITLE,
  PRIMARY_BOOK_TYPE,
  PRIMARY_MEDIA_ACTIVITY,
  PRIMARY_MEDIA_AGE,
  PRIMARY_MEDIA_NAME,
  SECONDARY_ACTIVITY,
  SECONDARY_BOOK_TITLE,
  SECONDARY_BOOK_TYPE,
  SECONDARY_MEDIA_ACTIVITY,
  SECONDARY_MEDIA_AGE,
  SECONDARY_MEDIA_NAME,
  SLEEP_ARRANGEMENT,
  SLEEP_PATTERN,
  TYPICAL_DAY_FLAG,
  WAKE_UP_COUNT,
  WAVE_ID,
} = PROPERTY_CONSTS;

const {
  DATETIME_END_FQN,
  DATETIME_START_FQN,
  DATE_TIME_FQN,
  ID_FQN,
  PERSON_ID,
  TITLE_FQN,
  VALUES_FQN,
} = PROPERTY_TYPE_FQNS;

const { getPageSectionKey, parsePageSectionKey } = DataProcessingUtils;

const selectTimeByPageAndKey = (pageNum :number, key :string, formData :Object) => {
  const psk = getPageSectionKey(pageNum, 0);
  const result = getIn(formData, [psk, key]);
  return DateTime.fromISO(result);
};

const selectPrimaryActivityByPage = (pageNum :number, formData :Object) :string => {
  const psk = getPageSectionKey(pageNum, 0);

  const activityName = getIn(formData, [psk, ACTIVITY_NAME]);
  return activityName;
};

const pageHasFollowupQuestions = (formData :Object, pageNum :number) => getIn(
  formData, [getPageSectionKey(pageNum, 0), HAS_FOLLOWUP_QUESTIONS], false
);

/*
 * Return true if the current page should display a summary of activities
 * Summary page is displayed after night activity page, hence page - 2 accounts for the night activity page
 */
const getIsSummaryPage = (formData :Object, page :number) => {
  const prevEndTime = selectTimeByPageAndKey(page - 2, ACTIVITY_END_TIME, formData);
  const dayEndTime = selectTimeByPageAndKey(DAY_SPAN_PAGE, DAY_END_TIME, formData);

  return prevEndTime.isValid && dayEndTime.isValid
    && prevEndTime.equals(dayEndTime)
    && pageHasFollowupQuestions(formData, page - 2);
};

/*
 * Return true if the schema is the night activity schema
 */
const getIsNightActivityPage = (schema :Object, page :number) => {
  const nightSchema = NightTimeActivitySchema.createSchema(page);

  return isEqual(schema, nightSchema);
};

const getIsDayTimeCompleted = (formData :Object, page :number) => {
  const prevEndTime = selectTimeByPageAndKey(page - 1, ACTIVITY_END_TIME, formData);
  const dayEndTime = selectTimeByPageAndKey(DAY_SPAN_PAGE, DAY_END_TIME, formData);

  return prevEndTime.isValid && dayEndTime.isValid
    && prevEndTime.equals(dayEndTime)
    && pageHasFollowupQuestions(formData, page - 1);
};

const getIs12HourFormatSelected = (formData :Object) :boolean => getIn(
  formData, [getPageSectionKey(SURVEY_INTRO_PAGE, 0), CLOCK_FORMAT]
) === 12;

const getSecondaryReadingSelected = (formData :Object, page :number) => getIn(
  formData, [getPageSectionKey(page, 0), SECONDARY_ACTIVITY], []
).includes(READING);

const getSecondaryMediaSelected = (formData :Object, page :number) => getIn(
  formData, [getPageSectionKey(page, 0), SECONDARY_ACTIVITY], []
).includes(MEDIA_USE);

const createFormSchema = (formData :Object, pageNum :number, trans :(string, ?Object) => string) => {

  const is12hourFormat = getIs12HourFormatSelected(formData);

  const isSecondaryReadingSelected = getSecondaryReadingSelected(formData, pageNum);
  const isSecondaryMediaSelected = getSecondaryMediaSelected(formData, pageNum);

  if (pageNum === SURVEY_INTRO_PAGE) {
    return {
      schema: SurveyIntroSchema.createSchema(trans),
      uiSchema: SurveyIntroSchema.uiSchema
    };
  }
  // case 1:
  if (pageNum === PRE_SURVEY_PAGE) {
    return {
      schema: PreSurveySchema.createSchema(trans),
      uiSchema: PreSurveySchema.uiSchema
    };
  }

  // case 2:
  if (pageNum === DAY_SPAN_PAGE) {
    return {
      schema: DaySpanSchema.createSchema(is12hourFormat, trans),
      uiSchema: DaySpanSchema.createUiSchema(is12hourFormat)
    };
  }

  const prevStartTime = selectTimeByPageAndKey(pageNum - 1, ACTIVITY_START_TIME, formData);

  const prevEndTime = pageNum === FIRST_ACTIVITY_PAGE
    ? selectTimeByPageAndKey(DAY_SPAN_PAGE, DAY_START_TIME, formData)
    : selectTimeByPageAndKey(pageNum - 1, ACTIVITY_END_TIME, formData);

  const currentActivity = selectPrimaryActivityByPage(pageNum, formData);
  const prevActivity = selectPrimaryActivityByPage(pageNum - 1, formData);

  const shouldDisplayFollowup = prevActivity
    && pageNum > FIRST_ACTIVITY_PAGE
    && !pageHasFollowupQuestions(formData, pageNum - 1);

  let schema;
  let uiSchema;

  const isDaytimeCompleted = getIsDayTimeCompleted(formData, pageNum);

  if (isDaytimeCompleted) {
    schema = NightTimeActivitySchema.createSchema(pageNum);
    uiSchema = NightTimeActivitySchema.createUiSchema(pageNum);
  }
  else if (shouldDisplayFollowup) {
    schema = ContextualSchema.createSchema(
      pageNum, prevActivity, prevStartTime, prevEndTime, isSecondaryReadingSelected, isSecondaryMediaSelected, trans
    );
    uiSchema = ContextualSchema.createUiSchema(pageNum, trans);
  }
  else {
    schema = PrimaryActivitySchema.createSchema(
      pageNum, prevActivity, currentActivity, prevEndTime, is12hourFormat, trans
    );
    uiSchema = PrimaryActivitySchema.createUiSchema(pageNum, is12hourFormat);
  }

  return {
    schema,
    uiSchema
  };
};

const createTimeUseSummary = (formData :Object) => {

  const summary = [];

  const is12hourFormat = getIs12HourFormatSelected(formData);

  // get day duration (start and end)
  const dayStartTime :DateTime = selectTimeByPageAndKey(DAY_SPAN_PAGE, DAY_START_TIME, formData);
  const dayEndTime :DateTime = selectTimeByPageAndKey(DAY_SPAN_PAGE, DAY_END_TIME, formData);

  const formattedDayStartTime = is12hourFormat
    ? dayStartTime.toLocaleString(DateTime.TIME_SIMPLE)
    : dayStartTime.toLocaleString(DateTime.TIME_24_SIMPLE);

  const formattedDayEndTime = is12hourFormat
    ? dayEndTime.toLocaleString(DateTime.TIME_SIMPLE)
    : dayEndTime.toLocaleString(DateTime.TIME_24_SIMPLE);

  // add day start time
  summary.push({
    time: formattedDayStartTime,
    description: 'Child woke up',
    pageNum: DAY_SPAN_PAGE
  });

  const lastPage = Object.keys(formData).length - 1;

  // omit the last 'page' since it covers nighttime
  Object.keys(formData).forEach((key, index) => {
    const hasFollowupQuestions = pageHasFollowupQuestions(formData, index);

    // skip page 0, 1, 2 and pages that have followup questions
    if (!(index === SURVEY_INTRO_PAGE || index === PRE_SURVEY_PAGE
        || index === DAY_SPAN_PAGE || hasFollowupQuestions)) {
      // if last page
      if (index === lastPage) {
        summary.push({
          time: `${formattedDayEndTime} - ${formattedDayStartTime}`,
          description: 'Sleeping',
          pageNum: Object.keys(formData).length - 1
        });
      }
      else {
        const startTime = selectTimeByPageAndKey(index, ACTIVITY_START_TIME, formData);
        const endTime = selectTimeByPageAndKey(index, ACTIVITY_END_TIME, formData);
        const primaryActivity :string = selectPrimaryActivityByPage(index, formData);

        const startFormatted = is12hourFormat
          ? startTime.toLocaleString(DateTime.TIME_SIMPLE)
          : startTime.toLocaleString(DateTime.TIME_24_SIMPLE);

        const endFormatted = is12hourFormat
          ? endTime.toLocaleString(DateTime.TIME_SIMPLE)
          : endTime.toLocaleString(DateTime.TIME_24_SIMPLE);

        const entry = {
          time: `${startFormatted} - ${endFormatted}`,
          description: primaryActivity,
          pageNum: index
        };

        summary.push(entry);
      }
    }
  });

  return summary;
};

const applyCustomValidation = (formData :Object, errors :Object, pageNum :number) => {
  const psk = getPageSectionKey(pageNum, 0);

  // For each activity, end date should greater than start date
  const startTimeKey = pageNum === DAY_SPAN_PAGE ? DAY_START_TIME : ACTIVITY_START_TIME;
  const endTimeKey = pageNum === DAY_SPAN_PAGE ? DAY_END_TIME : ACTIVITY_END_TIME;

  const currentStartTime = selectTimeByPageAndKey(pageNum, startTimeKey, formData);
  const currentEndTime = selectTimeByPageAndKey(pageNum, endTimeKey, formData);
  const dayEndTime = selectTimeByPageAndKey(DAY_SPAN_PAGE, DAY_END_TIME, formData);

  const errorMsg = pageNum === DAY_SPAN_PAGE
    ? `Bed time should be after ${currentStartTime.toLocaleString(DateTime.TIME_SIMPLE)}`
    : `End time should be after ${currentStartTime.toLocaleString(DateTime.TIME_SIMPLE)}`;

  if (currentStartTime.isValid && currentEndTime.isValid) {
    // $FlowFixMe invalid-compare
    if (currentEndTime <= currentStartTime) {
      errors[psk][endTimeKey].addError(errorMsg);
    }
    // the last activity of the day should end at the time the child went to bed
    // $FlowFixMe invalid-compare
    if (currentEndTime > dayEndTime) {
      errors[psk][endTimeKey].addError(`The last activity of the
          day should end at ${dayEndTime.toLocaleString(DateTime.TIME_SIMPLE)}
          since you indicated the child went to bed then.`);
    }
  }

  return errors;
};

const stringifyValue = (value :any) => {
  if (typeof value === 'boolean') {
    if (value) {
      return 'true';
    }
    return 'false';
  }
  return value;
};

// TODO: omit first page (clock format select) from form
const createSubmitRequestBody = (formData :Object, familyId :?string, waveId :?string) => {
  let result = [];

  const dateYesterday :DateTime = DateTime.local().minus({ days: 1 });
  const entriesToOmit = [ACTIVITY_START_TIME, ACTIVITY_END_TIME, HAS_FOLLOWUP_QUESTIONS];

  Object.entries(formData).forEach(([psk :string, pageData :Object]) => {

    const parsed :Object = parsePageSectionKey(psk);
    const { page } :{ page :string } = parsed;

    if (parseInt(page, 10) !== SURVEY_INTRO_PAGE) {

      let startTime = get(pageData, ACTIVITY_START_TIME);
      let endTime = get(pageData, ACTIVITY_END_TIME);

      if (startTime && endTime) {
        startTime = DateTime.fromISO(startTime);
        startTime = dateYesterday.set({ hour: startTime.hour, minute: startTime.minute });

        endTime = DateTime.fromISO(endTime);
        endTime = dateYesterday.set({ hour: endTime.hour, minute: endTime.minute });
      }

      // $FlowFixMe
      const sectionData = Object.entries(pageData) // $FlowFixMe
        .filter((entry) => !(entry[0] === ACTIVITY_NAME && !get(pageData, HAS_FOLLOWUP_QUESTIONS, false)))
        .filter((entry) => !entriesToOmit.includes(entry[0]))
        .map(([key, value]) => {
          const stringVal = stringifyValue(value);
          const entity = {
            [VALUES_FQN.toString()]: Array.isArray(stringVal) ? stringVal : [stringVal],
            [ID_FQN.toString()]: [key],
            [TITLE_FQN.toString()]: [get(QUESTION_TITLE_LOOKUP, key, key)],
            ...(startTime && endTime) && {
              [DATETIME_START_FQN.toString()]: [startTime],
              [DATETIME_END_FQN.toString()]: [endTime]
            }
          };
          return entity;
        });

      result = [...result, ...sectionData];
    }
  });

  // waveId & familyId
  if (waveId) {
    result.push({
      [VALUES_FQN.toString()]: [waveId],
      [ID_FQN.toString()]: [WAVE_ID],
      [TITLE_FQN.toString()]: ['Wave Id']
    });
  }
  if (familyId) {
    result.push({
      [VALUES_FQN.toString()]: [familyId],
      [ID_FQN.toString()]: [FAMILY_ID],
      [TITLE_FQN.toString()]: ['Family Id']
    });
  }
  return result;
};

function getAnswerString(
  questionAnswerId :Map,
  answersMap :Map,
  property :string
) {
  return answersMap.get(questionAnswerId.get(property), List()).toJS();
}

function getTimeRangeValue(values :Map, timeRangeId :UUID, key :FQN) {
  const dateVal = values.getIn([timeRangeId, key, 0]);
  return DateTime.fromISO(dateVal);
}

function writeToCsvFile(
  dataType :DataType,
  outputFileName :string,
  submissionMetadata :Map, // { submissionId: {participantId: _, date: }}
  answersMap :Map, // { answerId -> answer value }
  nonTimeRangeQuestionAnswerMap :Map, // submissionId -> question code -> answerID
  timeRangeQuestionAnswerMap :Map, // submissionId -> timeRangeId -> question code -> answerId
  submissionTimeRangeValues :Map // submission -> timeRangeId -> { start: <val>, end: <val>}
) {

  let csvData :Object[] = [];
  submissionMetadata.forEach((metadata :Map, submissionId :UUID) => {
    const questionAnswerId = nonTimeRangeQuestionAnswerMap.get(submissionId);
    const timeRangeQuestions = timeRangeQuestionAnswerMap.get(submissionId); // timeRangeId -> question code -> answerId
    const timeRangeValues = submissionTimeRangeValues.get(submissionId); // timeRangeId => { start: <?>, end: <?>}

    const csvMetadata = {};
    csvMetadata.Participant_ID = String(metadata.getIn([PERSON_ID, 0]));
    csvMetadata.Family_ID = getAnswerString(questionAnswerId, answersMap, FAMILY_ID);
    csvMetadata.Wave_Id = getAnswerString(questionAnswerId, answersMap, WAVE_ID);
    csvMetadata.Timestamp = DateTime
      .fromISO((metadata.getIn([DATE_TIME_FQN, 0])))
      .toLocaleString(DateTime.DATETIME_SHORT_WITH_SECONDS);
    csvMetadata.Day = getAnswerString(questionAnswerId, answersMap, DAY_OF_WEEK);
    csvMetadata.Typical_Day = getAnswerString(questionAnswerId, answersMap, TYPICAL_DAY_FLAG);
    csvMetadata.Non_Typical_Reason = getAnswerString(questionAnswerId, answersMap, NON_TYPICAL_DAY_REASON);

    const nightTimeData = {};
    nightTimeData.Typical_Sleep_Pattern = getAnswerString(questionAnswerId, answersMap, SLEEP_PATTERN);
    nightTimeData.Non_Typical_Sleep_Pattern = getAnswerString(questionAnswerId, answersMap, NON_TYPICAL_SLEEP_PATTERN);
    nightTimeData.Sleeping_Arrangement = getAnswerString(questionAnswerId, answersMap, SLEEP_ARRANGEMENT);
    nightTimeData.Wake_Up_Count = getAnswerString(questionAnswerId, answersMap, WAKE_UP_COUNT);
    nightTimeData.Background_TV_Night = getAnswerString(questionAnswerId, answersMap, BG_TV_NIGHT);
    nightTimeData.Background_Audio_Night = getAnswerString(questionAnswerId, answersMap, BG_AUDIO_NIGHT);

    if (dataType === DataTypes.NIGHTTIME) {
      csvData.push({ ...csvMetadata, ...nightTimeData });
      return;
    }

    let submissionData = [];
    timeRangeQuestions.forEach((questions :Map, timeRangeId :UUID) => {
      const activitiesData = {};

      activitiesData.Counter = 0;
      activitiesData.Primary_Activity = getAnswerString(questions, answersMap, ACTIVITY_NAME);
      activitiesData.Activity_Start = getTimeRangeValue(
        timeRangeValues, timeRangeId, DATETIME_START_FQN
      );
      activitiesData.Activity_End = getTimeRangeValue(
        timeRangeValues, timeRangeId, DATETIME_END_FQN
      );
      const duration = activitiesData.Activity_End.diff(activitiesData.Activity_Start, 'minutes').toObject().minutes;
      activitiesData['Duration(Min)'] = duration;
      activitiesData.Caregiver = getAnswerString(questions, answersMap, CAREGIVER);
      activitiesData.Primary_Media_Activity = getAnswerString(questions, answersMap, PRIMARY_MEDIA_ACTIVITY);
      activitiesData.Primary_Media_Age = getAnswerString(questions, answersMap, PRIMARY_MEDIA_AGE);
      activitiesData.Primary_Media_Name = getAnswerString(questions, answersMap, PRIMARY_MEDIA_NAME);
      activitiesData.Primary_Book_Type = getAnswerString(questions, answersMap, PRIMARY_BOOK_TYPE);
      activitiesData.Primary_Book_Title = getAnswerString(questions, answersMap, PRIMARY_BOOK_TITLE);
      activitiesData.Secondary_Media_Activity = getAnswerString(questions, answersMap, SECONDARY_MEDIA_ACTIVITY);
      activitiesData.Secondary_Media_Age = getAnswerString(questions, answersMap, SECONDARY_MEDIA_AGE);
      activitiesData.Secondary_Media_Name = getAnswerString(questions, answersMap, SECONDARY_MEDIA_NAME);
      activitiesData.Secondary_Book_Type = getAnswerString(questions, answersMap, SECONDARY_BOOK_TYPE);
      activitiesData.Secondary_Book_Title = getAnswerString(questions, answersMap, SECONDARY_BOOK_TITLE);
      activitiesData.Secondary_Activity = getAnswerString(questions, answersMap, SECONDARY_ACTIVITY);
      activitiesData.Background_TV_Day = getAnswerString(questions, answersMap, BG_TV_DAY);
      activitiesData.Background_Audio_Day = getAnswerString(questions, answersMap, BG_AUDIO_DAY);
      activitiesData.Adult_Media_Use = getAnswerString(questions, answersMap, ADULT_MEDIA);

      submissionData.push(activitiesData);
    });

    // sort
    submissionData = submissionData.sort((row1 :Object, row2 :Object) => {
      if (row1.Activity_Start > row2.Activity_Start) return 1;
      if (row1.Activity_Start < row2.Activity_Start) return -1;
      return 0;
    }).map((row :Object, index :number) => ({
      ...csvMetadata,
      ...row,
      Activity_Start: row.Activity_Start.toLocaleString(DateTime.TIME_24_SIMPLE),
      Activity_End: row.Activity_End.toLocaleString(DateTime.TIME_24_SIMPLE),
      Counter: index + 1,
    }));

    csvData = csvData.concat(submissionData);
  });

  const csv = Papa.unparse(csvData);
  const blob = new Blob([csv], {
    type: 'text/csv'
  });

  FS.saveAs(blob, outputFileName);
}

const getOutputFileName = (date :?string, startDate :?string, endDate :?string, dataType :DataType) => {
  const prefix = 'TimeUseDiary';

  if (date) {
    return `${prefix}_${dataType}_${date}`;
  }
  if (startDate && endDate) {
    return `${prefix}_${dataType}_${startDate}-${endDate}`;
  }

  return prefix;
};

export {
  applyCustomValidation,
  createFormSchema,
  createSubmitRequestBody,
  createTimeUseSummary,
  getIs12HourFormatSelected,
  getIsSummaryPage,
  getIsNightActivityPage,
  pageHasFollowupQuestions,
  selectPrimaryActivityByPage,
  selectTimeByPageAndKey,
  writeToCsvFile,
  getOutputFileName,
};
