const Queue = require("bull");

const imageQueue = new Queue("image transcoding");

imageQueue.process(function (job, done) {
  // transcode image asynchronously and report progress
  job.progress(42);

  // call done when finished
  done();

  // or give a error if error
  done(new Error("error transcoding"));

  // or pass it a result
  done(null, { width: 1280, height: 720 /* etc... */ });

  // If the job throws an unhandled exception it is also handled correctly
  throw new Error("some unexpected error");
});

imageQueue.add({ image: "http://example.com/image1.tiff" });

quotationQueue.add({}, { repeat: { cron: '* 8-17 * * 1-5' }});
