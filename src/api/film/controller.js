const async = require('async');
const mongoose = require('../../services/mongoose')

const { success, notFound } = require('../../services/response/');

const Film = require('./model').model;
const FilmDetail = require('./detailsModel').model;

const UserDetails = require('../user/detailsModel').model;
const Comment = require('../comment/model').model;

const ObjectId = require('mongoose').Types.ObjectId;

const sharp = require('sharp');
const FileType = require('file-type');

const formidable = require('formidable');
const fs = require('fs')

let gridfs = null
let thumbnailGridfs = null
mongoose.connection.on('connected', () => {
    gridfs = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'films' })
    thumbnailGridfs = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'thumbnails' })
})

const unlinkGridFs = async (film_id, ...thumbnailIds) => {

    const FilmGridFs = require('./gridfs');
    const ThumbnailGridFs = require('../thumbnail/gridfs');

    if (film_id) await FilmGridFs.unlink({ _id: film_id }, (err, doc) => { });

    for (let id of thumbnailIds) {
        if (!id) continue;
        await ThumbnailGridFs.unlink({ _id: id }, (err, doc) => { });
    }
};
const path = require('path');
const mime = require('mime-types')

const parseName = (file, name = '', ext = null) => {
    return path.parse(file.name).name + Date.now() + name + '.' + (ext ? ext : mime.extension(file.type))
}

const create = (req, res, next) => {
    const form = formidable({ multiples: true });

    form.parse(req, async (err, fields, files) => {
        if (err) {
            next(err);
            return;
        }
        try {

            const filmBody = {
                ...fields,
                author_name: req.user.name,
                author_id: req.user._id,
            };

            let film = new Film(filmBody)
            let filmDetail = new FilmDetail({ film_id: film._id })

            if (files.film && files.thumbnail) {

                let filmWriteStream = gridfs.openUploadStreamWithId(
                    film._id,
                    parseName(files.film), {
                    contentType: files.film.type || 'binary/octet-stream',
                    metadata: {
                        originalname: files.film.name
                    }
                })

                filmWriteStream.once('finish', async function () {

                    const webpBuffer = await sharp(files.thumbnail.path)
                        .resize(250, Math.round(250 * 9 / 16))
                        .webp({ reductionEffort: 6, quality: 80 })
                        .toBuffer();

                    const smallBuffer = await sharp(files.thumbnail.path)
                        .resize(250, Math.round(250 * 9 / 16))
                        .toBuffer();

                    const posterBuffer = await sharp(files.thumbnail.path)
                        .resize(500, Math.round(500 * 9 / 16))
                        .toBuffer();

                    const posterWebp = await sharp(all)
                        .resize(500, Math.round(500 * 9 / 16))
                        .webp({ reductionEffort: 6, quality: 80 })
                        .toBuffer();

                    const previewBuffer = await sharp(files.thumbnail.path)
                        .resize(25, Math.round(25 * 9 / 16))
                        .toBuffer();

                    const previewBufferWebp = await sharp(files.thumbnail.path)
                        .resize(25, Math.round(25 * 9 / 16))
                        .webp({ reductionEffort: 6, quality: 50 })
                        .toBuffer();

                    const webpBufferType = await FileType.fromBuffer(webpBuffer)

                    let stream = require('stream');
                    const ThumbnailGridFs = require('../thumbnail/gridfs');

                    let thumbnailBody = {}

                    async.waterfall([
                        function (done) {
                            let thumbnailWriteStream = thumbnailGridfs.openUploadStream(
                                parseName(files.thumbnail), {
                                contentType: files.thumbnail.type || 'binary/octet-stream',
                                metadata: {
                                    originalname: files.thumbnail.name
                                }
                            })

                            thumbnailWriteStream.once('finish', function () {
                                thumbnailBody._id = thumbnailWriteStream.id
                                done(null)
                            })

                            fs.createReadStream(files.thumbnail.path).pipe(thumbnailWriteStream)
                        },
                        function (done) {
                            let bufferStream = new stream.PassThrough();
                            bufferStream.end(webpBuffer);
                            ThumbnailGridFs.write({
                                filename: parseName(files.thumbnail, '_small_webp', webpBufferType.ext),
                                contentType: webpBufferType.mime,
                            }, bufferStream, (error, file) => {
                                thumbnailBody.small_webp = file._id;
                                done(error)
                            })
                        },
                        function (done) {
                            let bufferStream = new stream.PassThrough();
                            bufferStream.end(smallBuffer);

                            ThumbnailGridFs.write({
                                filename: parseName(files.thumbnail, '_small'),
                                contentType: files.thumbnail.type
                            }, bufferStream, (error, file) => {
                                thumbnailBody.small = file._id;
                                done(error)
                            })
                        },
                        function (done) {
                            let bufferStream = new stream.PassThrough();
                            bufferStream.end(posterBuffer);

                            ThumbnailGridFs.write({
                                filename: parseName(files.thumbnail, '_poster'),
                                contentType: files.thumbnail.type
                            }, bufferStream, (error, file) => {
                                thumbnailBody.poster = file._id;
                                done(error)
                            })
                        },
                        function (done) {
                            let bufferStream = new stream.PassThrough();
                            bufferStream.end(posterWebp);

                            ThumbnailGridFs.write({
                                filename: parseName(files.thumbnail, '_poster_webp', webpBufferType.ext),
                                contentType: webpBufferType.mime,
                            }, bufferStream, (error, file) => {
                                thumbnailBody.poster_webp = file._id;
                                done(error)
                            })
                        },
                        function (done) {
                            let bufferStream = new stream.PassThrough();
                            bufferStream.end(previewBuffer);

                            ThumbnailGridFs.write({
                                filename: parseName(files.thumbnail, '_preview'),
                                contentType: files.thumbnail.type
                            }, bufferStream, (error, file) => {
                                thumbnailBody.preview = file._id;
                                done(error)
                            })
                        },
                        function (done) {
                            let bufferStream = new stream.PassThrough();
                            bufferStream.end(previewBufferWebp);

                            ThumbnailGridFs.write({
                                filename: parseName(files.thumbnail, '_preview_webp', webpBufferType.ext),
                                contentType: webpBufferType.mime
                            }, bufferStream, (error, file) => {
                                thumbnailBody.preview_webp = file._id;
                                done(error)
                            })
                        }
                    ], async function (err) {

                        if (err) {
                            let message = err.message ? err.message : { 'error': 'Something went wrong!' };
                            await unlinkGridFs(req.files.film[0].id,
                                thumbnailBody._id, thumbnailBody.poster, thumbnailBody.poster_webp,
                                thumbnailBody.preview, thumbnailBody.preview_webp,
                                thumbnailBody.small, thumbnailBody.small_webp);
                            return res.status(400).json(message)
                        }
                        film.thumbnail = thumbnailBody
                        await film.save()
                    })
                })

                fs.createReadStream(files.film.path).pipe(filmWriteStream)
            }
            await film.save()
            await filmDetail.save()
            res.json({ ...film.view(true), ...filmDetail.view() });
        } catch (err) {
            next(err)
        }

    })
}

const index = async (req, res, next) => {

    if (!ObjectId.isValid(req.params.id)) return res.status(400).end();

    const showDetails = req.query.details

    let film = await Film.findOne({ _id: req.params.id, thumbnail: { $exists: true, $ne: null } })

    if (!film) return res.status(404).send({ error: `Film cannot be found!` })
    let toReturn = { ...film.view(true) }

    if (showDetails) {
        let filmDetails = await FilmDetail.findOne({ film_id: film.id })
            .then(details => {
                if (!details) return details
                let comments = details.comments.map(comment => comment.view())
                return { comments: comments, comments_count: details.comments_count }
            })

        if (!filmDetails) return res.status(404)
            .send({ error: `FilmDetails cannot be found!` })

        toReturn = { ...toReturn, ...filmDetails }
    }

    return res.status(200).send(toReturn)
};

const indexDetails = (req, res, next) =>
    FilmDetail.findOne({ film_id: req.params.id })
        .then(notFound(res))
        .then(details => details ? details.view() : null)
        .then(details => {
            if (!details) return details
            details.comments = details.comments.map(comment => comment.view())
            return details
        })
        .then(success(res))
        .catch(next)

const showThumbnail = async ({ params, query }, res, next) => {
    const ThumbnailGridFs = require('../thumbnail/gridfs');

    let film = await Film
        .findOne({ _id: params.id, thumbnail: { $exists: true, $ne: null } });

    if (film === null)
        return notFound(res)(null);


    let width = 900;
    let height = Math.round(width / 1.77777);

    let ratio = 16 / 9;

    if (query.ratio) {
        let r = query.ratio.split('/');
        ratio = parseInt(r[0]) / parseInt(r[1]);
    }

    let thumbnailId = film.thumbnail._id;

    if (Number.isNaN(parseInt(query.width))) {
        const id = film.thumbnail[query.width]
        thumbnailId = id ? id : thumbnailId

        const thumb = await ThumbnailGridFs.findById(ObjectId(thumbnailId))

        res.set('Content-Length', thumb.length)
        res.set('Cache-Control', 'max-age=604800');
        res.set('Content-Type', thumb.contentType);

        return thumbnailGridfs.openDownloadStream(ObjectId(thumbnailId)).pipe(res)
    } else {
        width = parseInt(query.width);
        height = Math.round(width / ratio);

        await ThumbnailGridFs.findById({ _id: ObjectId(thumbnailId) }, (err, thumbnail) => {


            if (err || thumbnail === null)
                return notFound(res)();


            let stream = thumbnail.read();

            let buffer = [];

            stream.on('data', function (chunk) {
                buffer.push(chunk);

            });

            stream.on('end', async function () {
                let all = new Buffer.concat(buffer);
                await sharp(all)
                    .resize(width, height)
                    .webp()
                    .toBuffer()
                    .then(async data => {
                        res.set('Content-Length', data.length);
                        res.set('Cache-Control', 'max-age=604800');
                        res.set('Content-Type', 'image/webp');
                        res.write(data);
                        res.end();
                    })
                    .catch(err => {
                        next(err)
                    });
            });
        })
    }
};

const getVideo = async (req, res, next) => {
    try {

        const FilmGridFs = require('./gridfs');

        FilmGridFs.findOne({ _id: req.params.id }, (err, film) => {
            if (err || film === null) return notFound(res)();

            const range = req.headers["range"]
            let contentType = film.contentType
            if (contentType.includes('audio')) contentType = contentType.replace('audio', 'video')

            if (range && typeof range === "string") {
                const parts = range.replace(/bytes=/, "").split("-")
                const partialstart = parts[0]
                const partialend = parts[1]

                let start = parseInt(partialstart, 10)
                let end = partialend ? parseInt(partialend, 10) : film.length - 1
                let chunksize = (end - start) + 1
                let maxChunk = 1024 * 1024; // 1MB at a time

                if (chunksize > maxChunk) {
                    end = start + maxChunk - 1;
                    chunksize = (end - start) + 1;
                }
                res.writeHead(206, {
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Range': 'bytes ' + start + '-' + end + '/' + film.length,
                    'Content-Type': contentType
                })

                let downloadStream = gridfs.openDownloadStream(film._id, { start, end: end + 1 })
                downloadStream.pipe(res)
                downloadStream.on('error', (err) => {
                    res.sendStatus(404)
                })
                downloadStream.on('end', () => {
                    res.end()
                })
            } else {
                res.header('Content-Length', film.length)
                res.header('Content-Type', contentType)

                let downloadStream = gridfs.openDownloadStream(film._id)
                downloadStream.pipe(res)
                downloadStream.on('error', () => {
                    res.sendStatus(404)
                })
                downloadStream.on('end', () => {
                    res.end()
                })
            }
        })

    } catch (err) {
        next(err)
    }

}

const getAll = ({ query }, res, next) => {

    const limit = parseInt(query.limit) || 10;
    const skip = parseInt(query.skip) || 0;

    let find = { thumbnail: { $exists: true, $ne: null } };
    
    let fields = ''

    if(query.preview) fields = '-description -author_id -meta.likes -meta.dislikes -thumbnail -updatedAt'

    if (query.exclude && !ObjectId.isValid(query.exclude)) return res.status(400).end();

    if (query.exclude) find = { ...find, _id: { $nin: [query.exclude] } };

    Film.find(find, fields)
        .skip(skip)
        .limit(limit)
        .then(film => film.map(film => film.view(true)))
        .then(success(res))
        .catch(next);
};

const update = async function ({ user, body, params }, res, next) {

    try {
        if (!Object.keys(body).length || !body.title || !body.description)
            return res.status(400).send({ error: 'Please provide title and description to perform a full film update!' })

        let film = await Film.findById(params.id)

        if (!film) return notFound(res)(null)

        if (!(user.role === 'admin' || user._id.equals(film.author_id)))
            return res.status(403).end()

        if (body.title) film.title = body.title
        if (body.description) film.description = body.description

        await film.save()

        return success(res)(film.view(true))
    }
    catch (err) {
        return next(err)
    }
};

const partialUpdate = async function ({ user, body, params }, res, next) {

    try {
        if (!Object.keys(body).length)
            return res.status(400).send({ error: 'Please provide title or description to perform a partial film update!' })

        let film = await Film.findById(params.id)

        if (!film) return notFound(res)(null)

        if (!(user.role === 'admin' || user._id.equals(film.author_id)))
            return res.status(403).end()

        if (body.title) film.title = body.title
        if (body.description) film.description = body.description

        await film.save()

        return success(res)(film.view(true))
    }
    catch (err) {
        return next(err)
    }
};

const view = ({ body, params }, res, next) =>
    Film.findOneAndUpdate({ _id: params.id, thumbnail: { $exists: true, $ne: null } }, { $inc: { 'meta.views': 1 } }, { new: true })
        .then(notFound(res))
        .then((film) => film ? film.view(true) : null)
        .then(success(res))
        .catch(next);

const like = async (req, res, next) => {

    const user = req.user;
    const action = req.body.action;

    const film_id = ObjectId(req.params.id)

    if (action !== 'like' && action !== 'dislike') return res.status(400).send({ error: '`action` param must be either like or dislike' })

    const session = await mongoose.startSession()
    await session.withTransaction(async function executor() {
        let userDetails = await UserDetails.findOne({ user_id: user._id }).session(session)

        let filmUpdate = {}

        if (action === 'dislike') {
            const added = await userDetails.disliked.addToSet(film_id)
            const length = userDetails.liked.length
            await userDetails.liked.pull(film_id)

            if (added.length > 0) filmUpdate = { ...filmUpdate, 'meta.dislikes': 1 }
            if (userDetails.liked.length !== length) filmUpdate = { ...filmUpdate, 'meta.likes': -1 }
            if (added.length === 0) {
                await userDetails.disliked.pull(film_id)
                filmUpdate = { ...filmUpdate, 'meta.dislikes': -1 }
            }
        } else {
            const added = userDetails.liked.addToSet(film_id)
            const length = userDetails.disliked.length
            userDetails.disliked.pull(film_id)

            if (added.length > 0) filmUpdate = { ...filmUpdate, 'meta.likes': 1 }
            if (userDetails.disliked.length !== length) filmUpdate = { ...filmUpdate, 'meta.dislikes': -1 }
            if (added.length === 0) {
                await userDetails.liked.pull(film_id)
                filmUpdate = { ...filmUpdate, 'meta.likes': -1 }
            }
        }

        let film = await Film.findOneAndUpdate({ _id: film_id }, { $inc: filmUpdate }, { new: true })

        await userDetails.save();

        await session.commitTransaction()
        session.endSession()

        return success(res)(film.view(true))

    }).catch((err) => {
        console.error(err)
        return res.status(500).send({ error: 'Something went wrong!' })
    })
};

const destroy = async (req, res, next) => {
    const session = await mongoose.startSession()

    await session.withTransaction(async function executor() {
        const { film_id } = req.params;

        if (!ObjectId.isValid(film_id)) return res.status(400).end();

        const user = req.user;

        let film = await Film.findById(film_id)

        if (!film) return notFound(res)(null)

        if (!(user.role === 'admin' || user._id.equals(film.author_id))) {

            await session.abortTransaction()
            session.endSession()

            return res.status(403).end()
        }

        await FilmDetail.deleteOne({ film_id: film_id })
            .session(session)

        await Film.deleteOne({ _id: film_id })
            .session(session);

        await Comment.deleteMany({ _id: { $in: film.comments } }).session(session);

        await unlinkGridFs(film_id, film.thumbnail._id, film.thumbnail.small,
            film.thumbnail.poster, film.thumbnail.small_webp,
            film.thumbnail.preview, film.thumbnail.preview_webp)

        await session.commitTransaction()
        session.endSession()

        return res.status(204).end()

    }).catch(() => {
        return res.status(500).json({ error: 'Something went wrong!' })
    })


};

const search = ({ params, query }, res, next) => {

    const limit = parseInt(query.limit) || 10;
    const skip = parseInt(query.skip) || 0;

    const titleToSearch = String(query.search).replace(/\./g, '\\.')

    let sort = {};

    let projection = '_id title meta thumbnail author author_name description createdAt'

    if(query.searchPage) projection = '-meta.likes -meta.dislikes -author_id -thumbnail -updatedAt'

    if (query.sort) {
        if (query.sort === 'upload_date') {
            sort = { sort: { createdAt: query.dir } };
        } else if (query.sort === 'view_count') {
            sort = { sort: { 'meta.views': query.dir } };
        } else if (query.sort === 'rating') {
            sort = { sort: { 'meta.likes': query.dir } };
        }
    }


    if (query.filter && query.filter !== '') {

        let currentDate = new Date();
        let destDate = new Date();

        if (query.filter === 'last_hour') {
            destDate.setHours(currentDate.getHours() - 1);
        } else if (query.filter === 'today') {
            destDate.setHours(0);
            destDate.setMinutes(0);
            destDate.setSeconds(0);
        } else if (query.filter === 'this_week') {
            destDate.setHours(0);
            destDate.setMinutes(0);
            destDate.setSeconds(0);

            let distance = 0 - currentDate.getDay();

            destDate.setDate(currentDate.getDate() + distance);
        } else if (query.filter === 'this_month') {
            destDate.setHours(0);
            destDate.setMinutes(0);
            destDate.setSeconds(0);

            let distance = 0 - currentDate.getDate();
            destDate.setDate(currentDate.getDate() + distance + 1);
        } else if (query.filter === 'this_year') {
            destDate.setHours(0);
            destDate.setMinutes(0);
            destDate.setSeconds(0);
            destDate.setDate(0);
            destDate.setMonth(0);

            let distance = 0 - currentDate.getMonth();
            destDate.setDate(currentDate.getMonth() + distance + 2);
        }

        Film.find({ title: new RegExp("^" + titleToSearch, 'i'), thumbnail: { $exists: true, $ne: null } }, projection, sort)
            .where('createdAt').gte(destDate).lte(currentDate)
            .skip(skip).limit(limit)
            .then(film => film.map(film => film.view(true)))
            .then(success(res))
            .catch(next);

    } else {

        Film.find({ title: new RegExp("^" + titleToSearch, 'i'), thumbnail: { $exists: true, $ne: null } }, projection, sort)
            .skip(skip).limit(limit)
            .then(films => films.map(film => film.view(true)))
            .then(success(res))
            .catch(next);
    }
};

module.exports = {
    create,
    index,
    indexDetails,
    getAll,
    getVideo,
    showThumbnail,
    update,
    partialUpdate,
    destroy,
    search,
    view,
    like
};