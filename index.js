const fs = require('fs');
const path = require('path');
const glob = require('glob');
const imagemin = require('imagemin');
const prompt = require('prompt');
const rimraf = require('rimraf');
const imageminMozjpeg = require('imagemin-mozjpeg');
const imageminPngquant = require('imagemin-pngquant');
const download = require('image-downloader');
const Crawler = require('simplecrawler');

async function compressImages(directory, jpgQuality, pngQuality) {
	const inputFolder = [directory + '/*.{jpg,png,JPG,PNG,JPEG}'];
	const outputFolder = directory + '/min';
	await imagemin(inputFolder, outputFolder, {
		plugins: [
			imageminMozjpeg({quality: jpgQuality}),
			imageminPngquant({quality: pngQuality})
		]
	});
}

async function renameImages(directory, shouldMoveFiles, showLog) {
	const folderToUse = directory + '/min/';
	glob(folderToUse + '**/*.*', (error, files) => {
		let processed = 0;
		files.forEach(file => {
			const filename = path.basename(file);
			if (shouldMoveFiles === 'Yes') {
				fs.renameSync(file, directory + '/' + filename.replace('.png', '-min.png').replace('.jpg', '-min.jpg'));
			} else {
				fs.renameSync(file, folderToUse + '/' + filename.replace('.png', '-min.png').replace('.jpg', '-min.jpg'));
			}
			processed++;
		});
		if (shouldMoveFiles === 'Yes') {
			rimraf.sync(folderToUse);
		}
		if (showLog === 'Yes') {
			console.log(processed + ' files compressed and renamed.');
			console.log('They can be found at: ' + directory);
		}
		console.log('Done.');
	});
}

async function handleHTTPImages(result) {
	result.folderToUse = path.join(__dirname, '/' + result.directory.replace(/https:\/\//g, '').replace(/http:\/\//g, '').replace(/[/]/g, '').replace(/[.]/g, ''));
	await pullImagesFromURL(result);
}

async function pullImagesFromURL(result) {
	const dir = result.folderToUse;
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir);
	}
	const crawler = new Crawler(result.directory);
	crawler.downloadUnsupported = true;
	crawler.decodeResponses = true;
	const listOfImages = [];
	crawler.addFetchCondition(queueItem => {
		return queueItem.path.match(/\.jpg|\.jpeg|\.JPG|\.JPEG|\.png|\.PNG/);
	});
	crawler.on('fetchcomplete', queueItem => {
		const options = {
			url: queueItem.url,
			dest: dir
		};
		listOfImages.push(options);
	});
	crawler.on('complete', async () => {
		// Remove the first item in the array as that is just the base URL
		listOfImages.shift();
		if (result.showLog === 'Yes') {
			console.log('Found ' + listOfImages.length + ' images, starting download.');
		}
		const downloads = [];
		for (let i = 0; i < listOfImages.length; i++) {
			try {
				downloads.push(download.image(listOfImages[i]));
			} catch (error) {
				if (result.showLog === 'Yes') {
					console.error(error);
				}
			}
		}
		await Promise.all(downloads);
		if (result.showLog === 'Yes') {
			console.log(listOfImages.length + ' images downloaded.');
		}
		await compressImages(result.folderToUse, result.jpgQuality, result.pngQuality);
		renameImages(result.folderToUse, result.shouldMove, result.showLog);
	});
	if (result.showLog === 'Yes') {
		console.log('Starting to crawl the site.');
	}
	crawler.start();
}

async function init(result) {
	try {
		if (result.directory.includes('http')) {
			handleHTTPImages(result);
		} else {
			await compressImages(result.directory, result.jpgQuality, result.pngQuality);
			renameImages(result.directory, result.shouldMove);
		}
	} catch (error) {
		if (result.showLog === 'Yes') {
			console.log(error);
		}
	}
}

prompt.start();
const schema = {
	properties: {
		directory: {
			description: 'Directory or URL of images to compress',
			type: 'string',
			message: 'Must be a directory or URL',
			required: true
		},
		jpgQuality: {
			description: 'Quality of compressed .jpg files (% quality)',
			type: 'integer',
			pattern: '^[0-9]*$',
			message: 'Must be a valid number',
			default: 35
		},
		pngQuality: {
			description: 'Quality of compressed .png files (% quality)',
			type: 'integer',
			pattern: '^[0-9]*$',
			message: 'Must be a valid number',
			default: 65
		},
		shouldMove: {
			description: 'Move .min.* files into the base directory?',
			pattern: '^(?:Yes|No)$',
			message: 'Must be Yes or No',
			default: 'No'
		},
		showLog: {
			description: 'Show log?',
			pattern: '^(?:Yes|No)$',
			message: 'Must be Yes or No',
			default: 'Yes'
		}
	}
};

prompt.get(schema, (err, result) => {
	if (!err) {
		init(result);
	}
});
