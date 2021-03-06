const Application = require('./../models/Application');
const Exercise = require('./../models/Exercise');
const Company = require('./../models/Company');
const User = require('./../models/User');
const Report = require('./../models/Report');

//TODO// FIX API KEY THAT IS NOT INJECTED FRON .ENV
const sgMail = require('@sendgrid/mail');
//const api = process.env.SENDGRID_API_KEY
sgMail.setApiKey(
  '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'
);

// GET ALL APPLIATIONS FROM COMPANY DASHBOARD
exports.getApplications = async ctx => {
  const { companyId } = ctx.request.jwtPayload;
  const result = await Company.findOne({ _id: companyId }).populate({
    path: 'applications',
    model: Application,
    populate: [
      {
        path: 'created_by',
        model: User,
        select: ['name', 'email']
      },
      {
        path: 'report',
        model: Report
      }
    ]
  });
  // CHECK IF ACTIVATED, AND IF SO IF THE TIME - STARTING TIME > EXERCISE TIME -> status: abandoned
  ctx.body = result.applications;
};

// GET SINGLE APPLICATION FROM APPLICANT BRIEFING PAGE
exports.getApplication = async ctx => {
  ctx.body = await Application.findOne({ _id: ctx.params.id }).populate([
    {
      path: 'exercise',
      model: Exercise
    },
    {
      path: 'created_by',
      model: User,
      select: ['name', 'email']
    }
  ]);
};

// POST REQUEST AFTER BRIEFING SUBMISSION
exports.startApplication = async ctx => {
  const { applicantName } = ctx.request.body;
  // CHECK INPUT
  if (!applicantName)
    ctx.throw(422, JSON.stringify({ error: 'Applicant name is required' }));
  // SET STARTING TIME
  const startingTime = Date.now();
  // CHECK IT'S STILL VALID (EXPIRATION TIME)
  const app = await Application.findOne({ _id: ctx.params.id });
  if (Date.now() - startingTime > app.token_duration)
    ctx.throw(422, JSON.stringify({ error: 'Token link expired' }));
  // CHECK IT HAS NEVER BEEN ACTIVATED
  if (app.status !== 'issued')
    ctx.throw(422, JSON.stringify({ error: 'This application is expired' }));
  // UPDATE THE APPLICATION
  await Application.findOneAndUpdate(
    { _id: ctx.params.id },
    {
      $set: {
        applicantName: applicantName,
        status: 'activated',
        startingTime: startingTime
      }
    },
    { new: true }
  );
  ctx.body = JSON.stringify({ message: 'successfully started' });
};

// SUBMIT APPLICATION
exports.submitApplication = async ctx => {
  const {
    completionTime,
    submittedCode,
    passed,
    tests,
    hints,
    duration,
    finalScore,
    copyPaste,
    testClicked
  } = ctx.request.body;
  // CHECK INPUT
  if (!completionTime)
    ctx.throw(422, JSON.stringify({ error: 'Completion time is required' }));
  if (!submittedCode)
    ctx.throw(422, JSON.stringify({ error: 'Submitted code is required' }));
  if (!tests) ctx.throw(422, JSON.stringify({ error: 'Tests are required' }));
  if (!hints) ctx.throw(422, JSON.stringify({ error: 'Hints are required' }));
  if (!duration)
    ctx.throw(422, JSON.stringify({ error: 'Duration is required' }));
  if (!finalScore)
    ctx.throw(422, JSON.stringify({ error: 'Final score is required' }));
  if (!copyPaste)
    ctx.throw(422, JSON.stringify({ error: 'Copy paste is required' }));
  if (!testClicked)
    ctx.throw(422, JSON.stringify({ error: 'Test clicked is required' }));
  // GET APPLICATION
  const app = await Application.findOne({ _id: ctx.params.id });
  // SAVE THE REPORT
  const savedReport = await Report.create({
    submittedCode,
    tests,
    hints,
    passed,
    duration,
    finalScore,
    copyPaste,
    testClicked,
    application: ctx.params.id,
    applicantName: app.applicantName
  });
  // UPDATE THE APPLICATION
  const updatedApplication = await Application.findOneAndUpdate(
    { _id: ctx.params.id },
    {
      $set: {
        completionTime,
        status: 'completed',
        submittedCode,
        passed,
        report: savedReport.id
      }
    },
    { new: true }
  );
  // FIND THE CREATOR OF THE APPLICATION
  const interviewer = await User.findOne({
    _id: updatedApplication.created_by
  });
  // SEND EMAIL TO APPLICANT
  const link = 'http://localhost:3000/dashboard';
  const msg = {
    to: interviewer.email,
    from: 'thesis@codeworks.com',
    templateId: 'd-ba359bea1c444916b3ee03074f45270b',
    dynamic_template_data: {
      appLink: link,
      applicantName: updatedApplication.applicantName,
      interviewerName: interviewer.name
    }
  };
  await sgMail.send(msg);
  ctx.body = JSON.stringify({ message: 'successfully submitted' });
};

// CREATE APPLICATION FROM COMPANY DASHBOARD
exports.createApplication = async ctx => {
  const { id, companyId } = ctx.request.jwtPayload;
  // CHECK INPUT
  const { exercise, applicantEmail, token_duration } = ctx.request.body;
  if (!exercise)
    ctx.throw(422, JSON.stringify({ error: 'Exercise id is required' }));
  if (!applicantEmail)
    ctx.throw(422, JSON.stringify({ error: 'Applicant email is required' }));
  if (!token_duration)
    ctx.throw(
      422,
      JSON.stringify({ error: 'Email token duration is required' })
    );
  // CHECK THAT THE EXERCISE EXISTS AND IS OWNED BY THE COMPANY
  const chosenExercise = await Exercise.findOne({ _id: exercise });
  if (chosenExercise.company == !companyId) {
    ctx.throw(
      422,
      JSON.stringify({
        error: 'Exercise not found or not related to your company'
      })
    );
  }
  // GET THE SENDER
  const sender = await User.findOne({ _id: id });
  // CREATE THE APPLICATION
  const createdApplication = await Application.create({
    exercise,
    applicantEmail,
    created_by: id,
    created_at: new Date().toISOString(),
    company: companyId,
    token_duration
  });
  // LINK THE APPLICATION TO THE COMPANY
  const updatedCompany = await Company.findOneAndUpdate(
    { _id: companyId },
    { $push: { applications: createdApplication.id } },
    { new: true }
  );
  // SEND EMAIL TO APPLICANT
  const link = `http://localhost:3000/assessment/${createdApplication._id}`;
  const msg = {
    to: applicantEmail,
    from: 'thesis@codeworks.com',
    templateId: 'd-2d90a8ea8c4142ad9267ee10863e5f0f',
    dynamic_template_data: {
      appLink: link,
      senderName: sender.name,
      companyName: updatedCompany.name
    }
  };
  await sgMail.send(msg);
  // FINISH
  ctx.body = 'Application succesfully created';
};

exports.setReviewed = async ctx => {
  await Application.findOneAndUpdate(
    { _id: ctx.params.id },
    {
      $set: {
        status: 'reviewed'
      }
    },
    { new: true }
  );
  ctx.body = 'Application succesfully updated to reviewed';
};

exports.deleteApplication = async ctx => {
  if (!ctx.params.id) ctx.throw(422, JSON.stringify({ error: 'Application not found' })) 
  const {companyId} = ctx.request.jwtPayload;
  const company = await Company.findOne({_id: companyId});
  const updatedApplications = company.applications.filter((elem) => {
    return elem !== ctx.params.id;
  });
  company.applications = updatedApplications;
  await company.save();
  await Application.findOneAndRemove({_id : ctx.params.id});
  ctx.body = 'succesfully deleted';
};